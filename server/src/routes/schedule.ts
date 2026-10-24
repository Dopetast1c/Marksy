import { addDays, trendOf, weekStartOf } from '@marksy/core';
import { and, asc, eq, gt, isNull, lte } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { finalMarks, lessons, schoolYears } from '../db/schema';
import type { AppDeps } from '../http/context';
import { route } from '../http/route';
import { registry } from '../openapi';
import { loadChild } from '../students/context';
import { factOf, lessonsIn, marksIn, refOf, subjectsOf } from '../students/data';
import { finalsOf, finalsState, lastYearFinals, termCell, termRef, yearCell } from '../students/finals';
import { finalCellOut, finalsStateOut, lessonOut, subjectRef, termRefOut } from './read-schemas';

// Расписание and Итоги (docs/design.md 5.5, 5.3b, 9): lessons with homework, «готово», «урока не будет», the room, the
// child's subgroup and the teacher's comment without a mark (D56); term and year finals with the running average where
// a final is not posted yet.

const id = z.string().uuid();

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
          /** The header line («I четверть идёт, итоги после 31 окт» / «I четверть выставлена сегодня») */
          state: finalsStateOut.nullable(),
          terms: z.array(termRefOut),
          /** The current school year (the table heading «2026/27 · 7 «Г»») */
          year: z.object({ id: z.string(), label: z.string() }).nullable(),
          /** The school year the «итог 2025/26: 8» line under a subject comes from */
          lastYear: z.object({ id: z.string(), label: z.string() }).nullable(),
          rows: z.array(
            z.object({
              subject: subjectRef,
              /** Last year's year final of the subject with the same name; null: «новый предмет» (when lastYear) */
              lastYear: z.object({ raw: z.string(), value: z.number().nullable() }).nullable(),
              terms: z.array(finalCellOut.extend({ termId: z.string() })),
              year: finalCellOut,
            }),
          ),
        }),
      ),
      errors: { 404: 'No such child' },
    },
    async (req, { params }) => {
      const ctx = await loadChild(deps, req, params.id);
      if (!ctx.year) return { state: null, year: null, terms: [], lastYear: null, rows: [] };
      const year = ctx.year;
      const [subjectRows, finals, last] = await Promise.all([
        subjectsOf(deps.db, ctx),
        finalsOf(deps.db, ctx),
        lastYearFinals(deps.db, ctx),
      ]);
      const facts = (await marksIn(deps.db, ctx.student.id, { from: year.startDate, to: year.endDate })).map(factOf);
      return {
        state: finalsState(ctx, finals),
        terms: ctx.termRows.map(termRef),
        year: { id: year.id, label: year.label },
        lastYear: last?.year ?? null,
        rows: subjectRows.map((s) => {
          const prev = last?.byName.get(s.name);
          return {
            subject: refOf(ctx, s.id, s.name),
            lastYear: prev ? { raw: prev.raw, value: prev.value } : null,
            terms: ctx.termRows.map((t) => ({ termId: t.id, ...termCell(ctx, finals, facts, s.id, t) })),
            year: yearCell(ctx, finals, facts, s.id),
          };
        }),
      };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/finals/years',
      summary: 'Итоги by year: each subject’s year final over the school years Marksy has, the running year in italics',
      tags: ['students'],
      access: 'member',
      params: z.object({ id }),
      response: z.object({
        years: z.array(z.object({ id: z.string(), label: z.string(), current: z.boolean() })),
        rows: z.array(
          z.object({
            subjectName: z.string(),
            /** The subject of the current year, for the tap; null: «в этом году нет» */
            subjectId: z.string().nullable(),
            /** In the current year but not in the one before it: «новый предмет» */
            isNew: z.boolean(),
            cells: z.array(finalCellOut.extend({ yearId: z.string() })),
            /** The current year against the one before (D5: the arrow, no signed delta) */
            trend: z.enum(['up', 'down', 'flat']).nullable(),
          }),
        ),
      }),
      errors: { 404: 'No such child' },
    },
    async (req, { params }) => {
      const ctx = await loadChild(deps, req, params.id);
      const current = ctx.year;
      const years = (
        await deps.db
          .select()
          .from(schoolYears)
          .where(and(eq(schoolYears.studentId, ctx.student.id), lte(schoolYears.startDate, ctx.today)))
          .orderBy(asc(schoolYears.startDate))
      ).filter((y) => !current || y.startDate <= current.startDate);
      const [yearFinals, subjectRows, finals] = await Promise.all([
        deps.db
          .select()
          .from(finalMarks)
          .where(
            and(eq(finalMarks.studentId, ctx.student.id), isNull(finalMarks.periodId), eq(finalMarks.role, 'final')),
          ),
        subjectsOf(deps.db, ctx),
        finalsOf(deps.db, ctx),
      ]);
      const facts = current
        ? (await marksIn(deps.db, ctx.student.id, { from: current.startDate, to: current.endDate })).map(factOf)
        : [];
      const before = current && years.length > 1 ? years[years.length - 2]! : null;
      // subjects are matched across years by the name the diary gives them (6.1)
      const names = [...new Set([...subjectRows.map((s) => s.name), ...yearFinals.map((f) => f.subjectName)])].sort(
        (a, b) => a.localeCompare(b),
      );
      const none = { kind: 'none' as const, raw: null, value: null, postedOn: null, source: null };
      return {
        years: years.map((y) => ({ id: y.id, label: y.label, current: y.id === current?.id })),
        rows: names.map((name) => {
          const s = subjectRows.find((x) => x.name === name);
          const cells = years.map((y) => {
            if (y.id === current?.id) return { yearId: y.id, ...(s ? yearCell(ctx, finals, facts, s.id) : none) };
            const f = yearFinals.find((x) => x.schoolYearId === y.id && x.subjectName === name);
            return {
              yearId: y.id,
              ...(f ? { kind: 'final' as const, raw: f.raw, value: f.mark, postedOn: f.date, source: f.source } : none),
            };
          });
          const cur = cells.at(-1)?.value ?? null;
          const prev = before ? (cells.at(-2)?.value ?? null) : null;
          return {
            subjectName: name,
            subjectId: s?.id ?? null,
            isNew: !!s && !!before && !yearFinals.some((x) => x.schoolYearId === before.id && x.subjectName === name),
            cells,
            trend: s && ctx.scale ? trendOf(ctx.scale, cur, prev) : null,
          };
        }),
      };
    },
  );

  return r;
}
