import {
  addDays,
  compareSubjects,
  comparePeriods,
  defaultGoal,
  marksNeeded,
  periodStats,
  previousInstance,
  scaleValues,
  sortSubjects,
  subjectHints,
} from '@marksy/core';
import type { GuidanceLesson, GuidanceMark, Hint, WorkType } from '@marksy/core';
import { and, desc, eq } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { subjectColors, subjectGoals, subjects, weekTemplates } from '../db/schema';
import type { AppDeps } from '../http/context';
import { HttpError } from '../http/errors';
import { route } from '../http/route';
import { registry } from '../openapi';
import { loadChild, periodQuery, resolvePeriod } from '../students/context';
import type { ChildContext } from '../students/context';
import { SUBJECT_COLORS } from '../students/colors';
import {
  absencesIn,
  chipOf,
  factOf,
  lessonCounts,
  lessonsIn,
  marksIn,
  subjectInfo,
  subjectsOf,
} from '../students/data';
import type { MarkRow } from '../students/data';
import { feedItem, feedItems } from '../students/feed';
import { finalsOf, finalsState, lastYearFinals, termCell, termRef, yearCell } from '../students/finals';
import { trendOf, trendResponse } from '../students/trend';
import { localTime } from '../sync/time';
import {
  bandCount,
  bandsOf,
  comparison,
  distributionOf,
  distributionOut,
  finalCellOut,
  lessonOut,
  markChip,
  periodOf,
  periodOut,
  termRefOut,
} from './read-schemas';

// Предметы and Предмет (docs/design.md 5.3a, 5.4, 6.6): every subject of the child with its average and direction under
// the mark filter, the subject screen with its settings (goal, colour), «О предмете», «Обратить внимание» (the goal row
// and the guidance hints, both gone with guidance off), the period's statistics, the coming lessons and the terms.

const id = z.string().uuid();
const childParams = z.object({ id });
const subjectParams = z.object({ id, subjectId: id });

/** The mark filter (MarkFilter, D27), shared by Оценки, Предметы and Предмет */
const markFilter = {
  tags: z.string().optional(),
  tagMode: z.enum(['any', 'all']).default('any'),
  /** only: the teacher's comments without a mark (D56), so no marks */
  comments: z.enum(['all', 'only', 'none']).default('all'),
};
type MarkFilterQuery = { tags?: string | undefined; comments: 'all' | 'only' | 'none' };
const tagList = (q: MarkFilterQuery) => q.tags?.split(',').filter(Boolean) ?? [];
// a mark carries its lesson's tags from M6 on; until then a tag filter finds no mark
const marksPass = (q: MarkFilterQuery) => !tagList(q).length && q.comments !== 'only';

const subjectInfoSchema = registry.register(
  'SubjectInfo',
  z.object({
    id: z.string(),
    name: z.string(),
    shortName: z.string().nullable(),
    teacherName: z.string().nullable(),
    groupLabel: z.string().nullable(),
    level: z.string().nullable(),
    levelLabel: z.string().nullable(),
    lessonsPerWeek: z.number().nullable(),
    /** The family's colour, a palette key of docs/tokens.json; null = «авто» (6.6) */
    color: z.string().nullable(),
  }),
);

const hintText = z.object({
  key: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.string()), z.null()])),
});

/** A guidance hint (6.2): the fact and the advice as i18n keys with raw scale values the app formats */
const hintOut = registry.register(
  'Hint',
  z.object({
    rule: z.string(),
    severity: z.enum(['critical', 'low', 'ok', 'good']),
    fact: hintText,
    advice: hintText.optional(),
    lessonId: z.string().optional(),
    date: z.string().optional(),
  }),
);

/** The goal row at the top of «Обратить внимание» (5.4): what the term's marks need for the goal final */
const goalRowOut = registry.register(
  'GoalRow',
  z.object({
    target: z.number(),
    /** reached: «хватает»; short: «ещё 2 × 9 или 1 × 10»; out_of_reach: not in this term; posted: the final is in */
    state: z.enum(['reached', 'short', 'out_of_reach', 'posted']),
    term: termRefOut,
    average: z.number().nullable(),
    /** The final the marks point to now («сейчас выходит 8») */
    projected: z.number().nullable(),
    /** The average the goal needs («нужен 7.5») */
    need: z.number(),
    plan: z.array(z.object({ value: z.number(), count: z.number() })),
    /** The worst next mark that keeps a reached goal */
    keep: z.number().nullable(),
    final: z.object({ raw: z.string(), value: z.number().nullable() }).nullable(),
  }),
);

const subjectRowOut = z.object({
  subject: subjectInfoSchema,
  comparison: comparison.nullable(),
  count: z.number(),
  last: z.array(markChip),
  absences: z.number().nullable(),
  /** «итог I: 8» in place of «было» while the term's finals are news (the next term has not started) */
  final: z.object({ term: termRefOut, raw: z.string(), mark: markChip }).nullable(),
  /** A year without marks (5.3a): lessons and homework in the period and the next lesson with its homework */
  lessons: z
    .object({
      count: z.number(),
      homework: z.number(),
      next: z
        .object({
          date: z.string(),
          slot: z.number().nullable(),
          homework: z.string().nullable(),
          lessonId: z.string(),
        })
        .nullable(),
    })
    .nullable(),
});

/** The subject of this child, or 404 */
async function subjectOf(deps: AppDeps, ctx: ChildContext, subjectId: string) {
  const [s] = await deps.db
    .select()
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.studentId, ctx.student.id)));
  if (!s) throw new HttpError(404, 'not_found', 'No such subject');
  return s;
}

/** The goal of a subject: the family's choice, null for «Без цели», the scale's default until one is chosen */
async function goalOf(deps: AppDeps, ctx: ChildContext, subjectId: string): Promise<number | null> {
  if (!ctx.scale) return null;
  const [row] = await deps.db
    .select({ termGoal: subjectGoals.termGoal })
    .from(subjectGoals)
    .where(and(eq(subjectGoals.studentId, ctx.student.id), eq(subjectGoals.subjectId, subjectId)));
  if (!row) return defaultGoal(ctx.scale);
  return row.termGoal == null ? null : Number(row.termGoal);
}

/** The goal needs terms, finals and a scale whose final rule can be inverted (6.2) */
const goalsApply = (ctx: ChildContext) =>
  !!ctx.scale && ctx.caps.terms && ctx.caps.finalMarks && defaultGoal(ctx.scale) != null;

const runningTerm = (ctx: ChildContext) =>
  ctx.termRows.find((t) => t.startDate <= ctx.today && ctx.today <= t.endDate) ?? null;

const guidanceMark = (m: MarkRow): GuidanceMark => ({
  ...factOf(m),
  raw: m.raw,
  ...(m.workType && { workType: m.workType as WorkType }),
  ...(m.comment && { comment: m.comment }),
});

export function subjectRoutes(deps: AppDeps): Router {
  const r = Router();
  const child = loadChild.bind(null, deps);

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/subjects',
      summary: 'Предметы: every subject with its average, direction and last marks under the mark filter',
      tags: ['students'],
      access: 'member',
      params: childParams,
      query: periodQuery.extend({
        sort: z.enum(['alpha', 'weak', 'strong', 'fell', 'rose']).default('alpha'),
        ...markFilter,
      }),
      response: z.object({ period: periodOut, subjects: z.array(subjectRowOut) }),
      errors: { 404: 'No such child or period' },
    },
    async (req, { params, query }) => {
      const ctx = await child(req, params.id);
      const p = resolvePeriod(ctx, query, ctx.scale ? 'marks' : 'lessons');
      const range = { from: p.from, to: p.to };
      const rows = await subjectsOf(deps.db, ctx);
      const all = marksPass(query) ? await marksIn(deps.db, ctx.student.id) : [];
      const prev = p.instance ? previousInstance(ctx.period, p.instance) : null;
      const absences = ctx.caps.attendance === 'none' ? null : await absencesIn(deps.db, ctx, range);
      const finals = ctx.scale ? await finalsOf(deps.db, ctx) : [];
      const state = ctx.scale ? finalsState(ctx, finals) : null;
      // a year without marks: lessons of the instance (to its end, they are planned ahead) and the lessons from today on
      const lessonRows = ctx.scale ? [] : await lessonsIn(deps.db, ctx, { from: p.from, to: p.end });
      const ahead = ctx.scale
        ? []
        : (await lessonsIn(deps.db, ctx, { from: ctx.today, to: addDays(ctx.today, 60) })).filter((l) => !l.cancelled);
      let order = rows.map((s) => s.id);
      const cmp = ctx.scale
        ? compareSubjects(ctx.scale, all.map(factOf), order, range, prev && { from: prev.from, to: prev.to })
        : [];
      if (ctx.scale && query.sort !== 'alpha') order = sortSubjects(ctx.scale, cmp, query.sort).map((c) => c.subjectId);
      if (!ctx.scale) {
        // by the next lesson; a subject with none in two weeks goes last
        const soon = addDays(ctx.today, 14);
        const key = (sid: string) => {
          const l = ahead.find((x) => x.subjectId === sid);
          return l && l.date <= soon ? `${l.date}:${String(l.slot ?? 99).padStart(2, '0')}` : '~';
        };
        order = [...order].sort((a, b) => key(a).localeCompare(key(b)));
      }
      return {
        period: periodOf(p),
        subjects: order.map((sid) => {
          const s = rows.find((x) => x.id === sid)!;
          const c = cmp.find((x) => x.subjectId === sid);
          const own = all.filter((m) => m.subjectId === sid && m.date >= p.from && m.date <= p.to);
          const f =
            state?.state === 'posted' ? finals.find((x) => x.subjectId === sid && x.periodId === state.term.id) : null;
          const ls = lessonRows.filter((l) => l.subjectId === sid && !l.cancelled);
          const next = ahead.find((l) => l.subjectId === sid);
          return {
            subject: subjectInfo(ctx, s),
            comparison: c ? (({ subjectId: _s, count: _c, ...rest }) => rest)(c) : null,
            count: c?.count ?? 0,
            last: own.slice(0, 5).map((m) => chipOf(ctx.scale, m)),
            absences: absences ? absences.filter((a) => a.subjectId === sid).length : null,
            final:
              f && state
                ? {
                    term: state.term,
                    raw: f.raw,
                    mark: chipOf(ctx.scale, {
                      id: f.id,
                      values: f.mark == null ? [] : [f.mark],
                      raw: f.raw,
                      kind: 'numeric',
                    }),
                  }
                : null,
            lessons: ctx.scale
              ? null
              : {
                  count: ls.length,
                  homework: ls.filter((l) => l.homework || l.ownHomework.length).length,
                  next: next
                    ? {
                        date: next.date,
                        slot: next.slot,
                        homework: next.homework ?? next.ownHomework[0]?.text ?? null,
                        lessonId: next.id,
                      }
                    : null,
                },
          };
        }),
      };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/subjects/:subjectId',
      summary:
        'Предмет: settings, «О предмете», «Обратить внимание», stats under the mark filter, the timeline, the coming lessons, the terms',
      tags: ['students'],
      access: 'member',
      params: subjectParams,
      query: periodQuery.extend(markFilter),
      response: z.object({
        subject: subjectInfoSchema,
        period: periodOut,
        /** «Настройки предмета»: the goal (null = «Без цели»), offered only where goals apply */
        settings: z.object({ goal: z.number().nullable(), goalAvailable: z.boolean() }),
        /** «Обратить внимание» (5.4): the goal row and the hints; both empty with guidance off (tags come with M6) */
        attention: z.object({ goal: goalRowOut.nullable(), hints: z.array(hintOut) }),
        comparison: comparison.nullable(),
        count: z.number(),
        prevCount: z.number().nullable(),
        bands: z.array(bandCount),
        distribution: distributionOut,
        timeline: z.array(feedItem),
        /** «Ближайшие уроки»: the next three lessons of the subject, the compact LessonRow; empty without a future timetable */
        upcoming: z.array(lessonOut),
        /** A year without marks: the tiles Уроков and Заданий for the period */
        lessonTiles: z
          .object({
            lessons: z.number(),
            homework: z.number(),
            prevLessons: z.number().nullable(),
            prevHomework: z.number().nullable(),
          })
          .nullable(),
        /** По четвертям (independent of the period and the filter): each term's cell and the year's */
        terms: z.array(termRefOut.extend({ cell: finalCellOut, average: z.number().nullable() })),
        year: finalCellOut.nullable(),
        lastYear: z.object({ label: z.string(), raw: z.string(), value: z.number().nullable() }).nullable(),
        /** «Когда» in «О предмете»: the subject's lessons of the regular week */
        week: z.array(
          z.object({
            weekday: z.number(),
            slot: z.number(),
            start: z.string().nullable(),
            end: z.string().nullable(),
            room: z.string().nullable(),
            groupLabel: z.string().nullable(),
          }),
        ),
      }),
      errors: { 404: 'No such child, subject or period' },
    },
    async (req, { params, query }) => {
      const ctx = await child(req, params.id);
      const s = await subjectOf(deps, ctx, params.subjectId);
      const p = resolvePeriod(ctx, query, ctx.scale ? 'marks' : 'lessons');
      const range = { from: p.from, to: p.to };
      const own = (await marksIn(deps.db, ctx.student.id)).filter((m) => m.subjectId === s.id);
      const facts = own.map(factOf);
      const shown = marksPass(query) ? facts : [];
      const prev = p.instance ? previousInstance(ctx.period, p.instance) : null;
      const scale = ctx.scale;
      const stats = scale ? periodStats(scale, shown, range) : null;
      const prevStats = scale && prev ? periodStats(scale, shown, prev) : null;
      const [template] = await deps.db
        .select()
        .from(weekTemplates)
        .where(eq(weekTemplates.studentId, ctx.student.id))
        .orderBy(desc(weekTemplates.fetchedAt))
        .limit(1);
      const values = shown.filter((m) => m.date >= p.from && m.date <= p.to).flatMap((m) => m.values);
      const finals = (await finalsOf(deps.db, ctx)).filter((f) => f.subjectId === s.id);
      const last = await lastYearFinals(deps.db, ctx);
      const prevYear = last?.byName.get(s.name);
      const goal = goalsApply(ctx) ? await goalOf(deps, ctx, s.id) : null;

      // the term part and «Обратить внимание» follow the running term, never the period or the filter
      const term = runningTerm(ctx);
      const termMarks = term ? own.filter((m) => m.date >= term.startDate && m.date <= term.endDate) : [];
      let goalRow: z.infer<typeof goalRowOut> | null = null;
      if (ctx.guidance && scale && goal != null && term) {
        const posted = finals.find((f) => f.periodId === term.id);
        const ts = periodStats(scale, termMarks.map(factOf), { from: term.startDate, to: term.endDate });
        const n = marksNeeded(scale, ts.sum, ts.count, goal);
        if (n && (posted || ts.count)) {
          goalRow = {
            target: goal,
            state: posted ? 'posted' : n.reached ? 'reached' : n.plan.length ? 'short' : 'out_of_reach',
            term: termRef(term),
            average: ts.average,
            projected: n.projected,
            need: n.need,
            plan: posted ? [] : n.plan,
            keep: posted ? null : n.keep,
            final: posted ? { raw: posted.raw, value: posted.mark } : null,
          };
        }
      }
      let hints: Hint[] = [];
      if (ctx.guidance && scale && ctx.rules) {
        const window = await lessonsIn(deps.db, ctx, { from: addDays(ctx.today, -30), to: addDays(ctx.today, 7) });
        const mine = window.filter((l) => l.subjectId === s.id);
        const absences = (await absencesIn(deps.db, ctx, { from: addDays(ctx.today, -14), to: ctx.today })).filter(
          (a) => a.subjectId === s.id,
        );
        hints = subjectHints({
          scale,
          rules: ctx.rules,
          caps: ctx.caps,
          today: ctx.today,
          termMarks: termMarks.map(guidanceMark),
          lessons: mine.map((l): GuidanceLesson => ({
            id: l.id,
            date: l.date,
            subjectId: l.subjectId,
            // what a test is comes from the family's tags (M6), never from the diary's types alone
            isTest: false,
            ...(l.lessonType && { lessonType: l.lessonType as GuidanceLesson['lessonType'] }),
            hasHomework: !!l.homework,
            ...(l.topic && { topic: l.topic }),
          })),
          absences: absences.map((a) => {
            const topic = mine.find((l) => l.id === a.lessonId)?.topic;
            return { date: a.date, subjectId: s.id, ...(topic && { topic }) };
          }),
        }).filter((h) => h.severity !== 'good');
      }

      let upcoming: Awaited<ReturnType<typeof lessonsIn>> = [];
      if (ctx.caps.lessons && ctx.caps.futureTimetable) {
        const minutes = localTime(ctx.now, ctx.timezone).minutes;
        const passed = (end: string | null) => {
          if (!end) return false;
          const [h, m] = end.split(':').map(Number);
          return h! * 60 + m! <= minutes;
        };
        upcoming = (await lessonsIn(deps.db, ctx, { from: ctx.today, to: addDays(ctx.today, 60) }))
          .filter((l) => l.subjectId === s.id && !(l.date === ctx.today && passed(l.end)))
          .slice(0, 3);
      }

      return {
        subject: subjectInfo(ctx, s),
        period: periodOf(p),
        settings: { goal, goalAvailable: goalsApply(ctx) },
        attention: { goal: goalRow, hints },
        comparison: scale && stats ? comparePeriods(scale, stats, prevStats) : null,
        count: stats?.count ?? 0,
        prevCount: prevStats ? prevStats.count : null,
        bands: scale && stats ? bandsOf(scale, stats, prevStats) : [],
        distribution: scale ? distributionOf(scale, values) : [],
        timeline: await feedItems(deps, ctx, range, {
          subjectId: s.id,
          comments: query.comments,
          tags: tagList(query),
        }),
        upcoming,
        lessonTiles: scale ? null : await lessonCounts(deps.db, ctx, p, s.id),
        terms: ctx.caps.terms
          ? ctx.termRows.map((t) => ({
              ...termRef(t),
              cell: termCell(ctx, finals, facts, s.id, t),
              average:
                scale && t.startDate <= ctx.today
                  ? periodStats(scale, facts, { from: t.startDate, to: t.endDate }).average
                  : null,
            }))
          : [],
        year: ctx.caps.terms && ctx.caps.finalMarks ? yearCell(ctx, finals, facts, s.id) : null,
        lastYear: last && prevYear ? { label: last.year.label, raw: prevYear.raw, value: prevYear.value } : null,
        week: (template?.entries ?? [])
          .filter((e) => e.subject_id === s.id)
          .map((e) => ({
            weekday: e.weekday,
            slot: e.slot,
            start: e.start ?? null,
            end: e.end ?? null,
            room: e.room ?? null,
            groupLabel: e.group_label ?? null,
          })),
      };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/subjects/:subjectId/trend',
      summary: 'Динамика of one subject under the mark filter (TrendCard on Предмет)',
      tags: ['students'],
      access: 'member',
      params: subjectParams,
      query: periodQuery.extend(markFilter),
      response: trendResponse,
      errors: { 404: 'No such child, subject or period' },
    },
    async (req, { params, query }) => {
      const ctx = await child(req, params.id);
      const s = await subjectOf(deps, ctx, params.subjectId);
      return trendOf(deps, ctx, query, { subjectId: s.id, marks: marksPass(query) });
    },
  );

  route(
    r,
    {
      method: 'put',
      path: '/api/students/:id/subjects/:subjectId/color',
      summary: 'The subject’s colour for the whole family (6.6): a palette key, or null for «Авто»',
      tags: ['students'],
      access: 'member',
      params: subjectParams,
      body: z.object({ color: z.enum(SUBJECT_COLORS).nullable() }),
      response: z.object({ color: z.string().nullable() }),
      errors: { 404: 'No such child or subject' },
    },
    async (req, { params, body }) => {
      const ctx = await child(req, params.id);
      const s = await subjectOf(deps, ctx, params.subjectId);
      const set = { color: body.color, setBy: ctx.userId, updatedAt: ctx.now };
      await deps.db
        .insert(subjectColors)
        .values({ studentId: ctx.student.id, subjectId: s.id, ...set })
        .onConflictDoUpdate({ target: [subjectColors.studentId, subjectColors.subjectId], set });
      return { color: body.color };
    },
  );

  route(
    r,
    {
      method: 'put',
      path: '/api/students/:id/subjects/:subjectId/goal',
      summary: 'The subject’s goal for the term (5.4): a whole value of the child’s scale, or null for «Без цели»',
      tags: ['students'],
      access: 'member',
      params: subjectParams,
      body: z.object({ termGoal: z.number().nullable() }),
      response: z.object({ goal: z.number().nullable() }),
      errors: {
        400: 'Goals do not apply to this child, or the value is not on the scale',
        404: 'No such child or subject',
      },
    },
    async (req, { params, body }) => {
      const ctx = await child(req, params.id);
      const s = await subjectOf(deps, ctx, params.subjectId);
      if (!goalsApply(ctx) || !ctx.scale) throw new HttpError(400, 'no_goals', 'Goals do not apply to this child');
      const v = body.termGoal;
      if (v != null && (!Number.isInteger(v) || !scaleValues(ctx.scale).includes(v)))
        throw new HttpError(400, 'out_of_scale', "The value is outside the child's scale");
      const set = { termGoal: v == null ? null : String(v), setBy: ctx.userId, updatedAt: ctx.now };
      await deps.db
        .insert(subjectGoals)
        .values({ studentId: ctx.student.id, subjectId: s.id, ...set })
        .onConflictDoUpdate({ target: [subjectGoals.studentId, subjectGoals.subjectId], set });
      return { goal: v };
    },
  );

  return r;
}
