import { addDays, lessonPassed, trendOf, weekStartOf } from '@marksy/core';
import { and, asc, eq, gt, gte, isNull, lte, sql } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { finalMarks, lessonOverrides, lessons, schoolYears } from '../db/schema';
import type { AppDeps } from '../http/context';
import { route } from '../http/route';
import { registry } from '../openapi';
import { loadChild } from '../students/context';
import { factOf, lessonsIn, marksIn, refOf, subjectsOf } from '../students/data';
import { finalsOf, finalsState, lastYearFinals, termCell, termRef, yearCell } from '../students/finals';
import { lessonNotes } from '../students/lesson-notes';
import {
  finalCellOut,
  finalsStateOut,
  hintOut,
  lessonOut,
  markChip,
  subjectRef,
  tagRefOut,
  termRefOut,
} from './read-schemas';

// Расписание and Итоги (docs/design.md 5.5, 5.3b, 9): lessons with homework, «готово», «урока не будет», the room, the
// child's subgroup and the teacher's comment without a mark (D56); term and year finals with the running average where
// a final is not posted yet.

const id = z.string().uuid();
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A lesson of Расписание: the shared row plus the пометки of a lesson that has not passed (5.5); null once it has */
const scheduleLessonOut = lessonOut.extend({
  notes: z
    .object({
      /** факты, as of the lesson; null: no mark in the subject this school year yet */
      facts: z
        .object({
          average: z.number().nullable(),
          /** the last five marks this school year, oldest first */
          last: z.array(markChip),
          lastDate: z.string(),
          /** lessons of the subject since the last mark («2 урока назад»); cancelled ones are skipped */
          since: z.number(),
        })
        .nullable(),
      /** сигнал (guidance on): call after the family's callAfter lessons, callLow with a low average, push otherwise */
      signal: z
        .object({ kind: z.enum(['call', 'callLow', 'push']), lessons: z.number(), average: z.number().nullable() })
        .nullable(),
      /** подсказка (6.2, guidance on) */
      hint: hintOut.nullable(),
    })
    .nullable(),
});

const attentionOut = z.object({
  tag: tagRefOut,
  field: z.enum(['topic', 'homework', 'type']),
  /** the diary's words that matched, as written */
  snippet: z.string().nullable(),
  /** a homework hit: the day it was set («задано ср, 14 окт: …») */
  setOn: z.string().nullable(),
  lessonId: z.string(),
  date: z.string(),
  slot: z.number().nullable(),
  subject: subjectRef,
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
        /** today, tomorrow, next (the next day with lessons) or a date */
        day: z.union([z.enum(['today', 'tomorrow', 'next']), z.string().regex(ISO_DAY)]).optional(),
        week: z.coerce.number().int().min(-60).max(8).optional(),
      }),
      response: registry.register(
        'Schedule',
        z.object({
          from: z.string(),
          to: z.string(),
          days: z.array(z.object({ date: z.string(), lessons: z.array(scheduleLessonOut) })),
          /** «Обратить внимание» (5.5): the range's lessons still ahead that carry a tag, by date and lesson number */
          attention: z.array(attentionOut),
        }),
      ),
      errors: { 404: 'No such child' },
    },
    async (req, { params, query }) => {
      const ctx = await loadChild(deps, req, params.id);
      let from = ctx.today;
      let to = ctx.today;
      if (query.week !== undefined) {
        from = addDays(weekStartOf(ctx.today, ctx.manifest.calendar.weekStart), 7 * query.week);
        to = addDays(from, 6);
      } else if (query.day && ISO_DAY.test(query.day)) {
        from = to = query.day;
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
      const notes = await lessonNotes(
        deps.db,
        ctx,
        { from, to },
        rows,
        (id) => !!rows.find((l) => l.id === id)?.isTest,
      );
      const dates = [...new Set(rows.map((l) => l.date))];
      const ahead = rows.filter((l) => !l.cancelled && !lessonPassed(l, ctx.now, ctx.timezone));
      return {
        from,
        to,
        days: dates.map((date) => ({
          date,
          lessons: rows.filter((l) => l.date === date).map((l) => ({ ...l, notes: notes.get(l.id) ?? null })),
        })),
        attention: ahead.flatMap((l) =>
          l.tags.map((t) => ({
            ...t,
            lessonId: l.id,
            date: l.date,
            slot: l.slot,
            subject: { id: l.subjectId, name: l.subjectName, color: l.subjectColor },
          })),
        ),
      };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/schedule/days',
      summary: 'The days of the school year with lessons and how many (the Расписание navigator and its picker, 5.5)',
      tags: ['students'],
      access: 'member',
      params: z.object({ id }),
      response: z.object({
        today: z.string(),
        /**
         * Every day with lessons; `held` leaves out the cancelled ones (the picker's count). A day whose lessons are
         * all cancelled stays reachable, so «Вернуть урок» is too.
         */
        days: z.array(z.object({ date: z.string(), lessons: z.number(), held: z.number() })),
      }),
      errors: { 404: 'No such child' },
    },
    async (req, { params }) => {
      const ctx = await loadChild(deps, req, params.id);
      if (!ctx.year) return { today: ctx.today, days: [] };
      const rows = await deps.db
        .select({
          date: lessons.date,
          lessons: sql<number>`count(*)::int`,
          held: sql<number>`(count(*) filter (where not ${lessons.cancelled} and ${lessonOverrides.lessonId} is null))::int`,
        })
        .from(lessons)
        .leftJoin(lessonOverrides, and(eq(lessonOverrides.lessonId, lessons.id), eq(lessonOverrides.cancelled, true)))
        .where(
          and(
            eq(lessons.studentId, ctx.student.id),
            isNull(lessons.removedAt),
            gte(lessons.date, ctx.year.startDate),
            lte(lessons.date, ctx.year.endDate),
          ),
        )
        .groupBy(lessons.date)
        .orderBy(asc(lessons.date));
      return { today: ctx.today, days: rows };
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
