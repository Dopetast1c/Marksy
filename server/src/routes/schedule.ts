import { addDays, periodStats, weekStartOf } from '@marksy/core';
import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { finalMarks, lessons, schoolYears, subjects } from '../db/schema';
import type { AppDeps } from '../http/context';
import { route } from '../http/route';
import { registry } from '../openapi';
import { loadChild } from '../students/context';
import { factOf, lessonsIn, marksIn } from '../students/data';
import { lessonOut } from './read-schemas';

// Расписание and Итоги (docs/design.md 5.5, 5.3b, 9): lessons with homework, «готово», «урока не будет», the room, the
// child's subgroup and the teacher's comment without a mark (D56); term and year finals with the running average where
// a final is not posted yet.

const id = z.string().uuid();

const finalCell = z.object({
  kind: z.enum(['final', 'running', 'none']),
  raw: z.string().nullable(),
  value: z.number().nullable(),
});

export function scheduleRoutes(deps: AppDeps): Router {
  const r = Router();

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/schedule',
      summary: 'Расписание: today, tomorrow, the next school day, or a week (week=0 this week, 1 next, -1 last)',
      tags: ['students'],
      access: 'member',
      params: z.object({ id }),
      query: z.object({
        day: z.enum(['today', 'tomorrow', 'next']).optional(),
        week: z.coerce.number().int().min(-60).max(8).optional(),
      }),
      response: z.object({
        from: z.string(),
        to: z.string(),
        days: z.array(z.object({ date: z.string(), lessons: z.array(lessonOut) })),
      }),
      errors: { 404: 'No such child' },
    },
    async (req, { params, query }) => {
      const ctx = await loadChild(deps, req, params.id);
      let from = ctx.today;
      let to = ctx.today;
      if (query.week !== undefined) {
        from = addDays(weekStartOf(ctx.today, ctx.manifest.calendar.weekStart), 7 * query.week);
        to = addDays(from, 6);
      } else if (query.day === 'tomorrow') {
        from = to = addDays(ctx.today, 1);
      } else if (query.day === 'next') {
        // the next day after today that has lessons
        const [next] = await deps.db
          .select({ date: lessons.date })
          .from(lessons)
          .where(and(eq(lessons.studentId, ctx.student.id), gt(lessons.date, ctx.today), isNull(lessons.removedAt)))
          .orderBy(asc(lessons.date))
          .limit(1);
        from = to = next?.date ?? addDays(ctx.today, 1);
      }
      const rows = await lessonsIn(deps.db, ctx, { from, to });
      const dates = [...new Set(rows.map((l) => l.date))];
      return { from, to, days: dates.map((date) => ({ date, lessons: rows.filter((l) => l.date === date) })) };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/finals/quarters',
      summary: 'Итоги by term: the posted final, or the running average until it is posted, and the year',
      tags: ['students'],
      access: 'member',
      params: z.object({ id }),
      response: registry.register(
        'TermFinals',
        z.object({
          terms: z.array(z.object({ id: z.string(), label: z.string(), from: z.string(), to: z.string() })),
          rows: z.array(
            z.object({
              subject: z.object({ id: z.string(), name: z.string() }),
              terms: z.array(finalCell.extend({ termId: z.string() })),
              year: finalCell,
            }),
          ),
        }),
      ),
      errors: { 404: 'No such child' },
    },
    async (req, { params }) => {
      const ctx = await loadChild(deps, req, params.id);
      if (!ctx.year) return { terms: [], rows: [] };
      const year = ctx.year;
      const subjectRows = await deps.db
        .select()
        .from(subjects)
        .where(and(eq(subjects.studentId, ctx.student.id), eq(subjects.schoolYearId, year.id)))
        .orderBy(asc(subjects.name));
      const finals = await deps.db
        .select()
        .from(finalMarks)
        .where(
          and(
            eq(finalMarks.studentId, ctx.student.id),
            eq(finalMarks.schoolYearId, year.id),
            eq(finalMarks.role, 'final'),
          ),
        );
      const facts = (await marksIn(deps.db, ctx.student.id, { from: year.startDate, to: year.endDate })).map(factOf);
      const cell = (subjectId: string, termId: string | null, from: string, to: string) => {
        const f = finals.find((x) => x.subjectId === subjectId && x.periodId === termId);
        if (f) return { kind: 'final' as const, raw: f.raw, value: f.mark };
        const avg = ctx.scale
          ? periodStats(
              ctx.scale,
              facts.filter((m) => m.subjectId === subjectId),
              { from, to: to < ctx.today ? to : ctx.today },
            ).average
          : null;
        return avg == null
          ? { kind: 'none' as const, raw: null, value: null }
          : { kind: 'running' as const, raw: null, value: avg };
      };
      return {
        terms: ctx.termRows.map((t) => ({ id: t.id, label: t.label, from: t.startDate, to: t.endDate })),
        rows: subjectRows.map((s) => ({
          subject: { id: s.id, name: s.name },
          terms: ctx.termRows
            // a term that has not started has nothing, not a zero
            .map((t) => ({
              termId: t.id,
              ...(t.startDate > ctx.today
                ? { kind: 'none' as const, raw: null, value: null }
                : cell(s.id, t.id, t.startDate, t.endDate)),
            })),
          year: cell(s.id, null, year.startDate, year.endDate),
        })),
      };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/finals/years',
      summary: 'Итоги by year: each subject’s year final over the school years Marksy has',
      tags: ['students'],
      access: 'member',
      params: z.object({ id }),
      response: z.object({
        years: z.array(z.object({ id: z.string(), label: z.string() })),
        rows: z.array(
          z.object({
            subjectName: z.string(),
            cells: z.array(z.object({ yearId: z.string(), raw: z.string().nullable(), value: z.number().nullable() })),
          }),
        ),
      }),
      errors: { 404: 'No such child' },
    },
    async (req, { params }) => {
      const ctx = await loadChild(deps, req, params.id);
      const years = await deps.db
        .select()
        .from(schoolYears)
        .where(and(eq(schoolYears.studentId, ctx.student.id), lte(schoolYears.startDate, ctx.today)))
        .orderBy(asc(schoolYears.startDate));
      const finals = await deps.db
        .select()
        .from(finalMarks)
        .where(
          and(eq(finalMarks.studentId, ctx.student.id), isNull(finalMarks.periodId), eq(finalMarks.role, 'final')),
        );
      // subjects are matched across years by name, as the diary names them
      const names = [...new Set(finals.map((f) => f.subjectName))].sort((a, b) => a.localeCompare(b));
      return {
        years: years.map((y) => ({ id: y.id, label: y.label })),
        rows: names.map((name) => ({
          subjectName: name,
          cells: years.map((y) => {
            const f = finals.find((x) => x.schoolYearId === y.id && x.subjectName === name);
            return { yearId: y.id, raw: f?.raw ?? null, value: f?.mark ?? null };
          }),
        })),
      };
    },
  );

  return r;
}
