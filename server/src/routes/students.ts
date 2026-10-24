import {
  addDays,
  availableKinds,
  compareSubjects,
  comparePeriods,
  distributionBuckets,
  listInstances,
  movers,
  periodInstance,
  periodStats,
  previousInstance,
  sortSubjects,
  trendBuckets,
} from '@marksy/core';
import type { PeriodKind } from '@marksy/core';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { bellSchedules, finalMarks, markEvents, marks, subjects, userSeen, weekTemplates } from '../db/schema';
import type { MarkDiff } from '../db/schema';
import { childName } from '../family/children';
import type { AppDeps } from '../http/context';
import { memberOf } from '../http/context';
import { HttpError } from '../http/errors';
import { route } from '../http/route';
import { registry } from '../openapi';
import { loadChild, periodQuery, resolvePeriod } from '../students/context';
import type { ChildContext } from '../students/context';
import { absencesIn, chipOf, factOf, lessonsIn, marksIn, remarksIn, subjectInfo, subjectsOf } from '../students/data';
import { childEvents } from '../students/events';
import { nowLine } from '../students/now';
import { localTime } from '../sync/time';
import { visibleStudents } from './me';
import {
  bandCount,
  bandsOf,
  childEvent,
  comparison,
  markChip,
  nowLine as nowLineSchema,
  instanceOut,
  periodOf,
  periodOut,
  subjectRef,
} from './read-schemas';

// The read API of one child (docs/design.md 5.2 to 5.4, 5.9, 9): the picker cards, Главная, the marks feed, Предметы,
// Предмет with its trend and regular week, absences, Внимание, Школа. Everything is on the child's scale and calendar;
// the teacher's comments without a mark (D56) come only where the provider has behaviour, never as marks.

const id = z.string().uuid();
const childParams = z.object({ id });
const subjectParams = z.object({ id, subjectId: id });
const FEED_CHANGES_DAYS = 14;

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
  }),
);

const feedItem = registry.register(
  'FeedItem',
  z.discriminatedUnion('type', [
    z.object({
      type: z.literal('mark'),
      id: z.string(),
      date: z.string(),
      subject: subjectRef,
      mark: markChip,
      workType: z.string().nullable(),
      workTypeRaw: z.string().nullable(),
      topic: z.string().nullable(),
      comment: z.string().nullable(),
      lessonId: z.string().nullable(),
      /** The tags of the mark's lesson (M6) */
      tagIds: z.array(z.string()),
      isNew: z.boolean(),
    }),
    /** A teacher's comment without a mark (D56): its own row after the marks of the day, never a chip */
    z.object({
      type: z.literal('comment'),
      id: z.string(),
      date: z.string(),
      subject: subjectRef.nullable(),
      text: z.string().nullable(),
      lessonId: z.string().nullable(),
      slot: z.number().nullable(),
    }),
    /** A mark the teacher changed or removed, shown for 14 days (design.md 8) */
    z.object({
      type: z.enum(['markChanged', 'markRemoved']),
      id: z.string(),
      date: z.string(),
      subject: subjectRef,
      mark: markChip,
      before: z.string().nullable(),
      seenAt: z.date(),
    }),
  ]),
);

type FeedItem = z.infer<typeof feedItem>;

async function lastSeen(deps: AppDeps, ctx: ChildContext): Promise<Date | null> {
  const [row] = await deps.db
    .select({ at: userSeen.lastSeenAt })
    .from(userSeen)
    .where(and(eq(userSeen.userId, ctx.userId), eq(userSeen.studentId, ctx.student.id)));
  return row?.at ?? null;
}

/** Marks and teacher comments of one child, newest day first; in a day the marks, then the comments, then changes */
async function feedItems(
  deps: AppDeps,
  ctx: ChildContext,
  range: { from: string; to: string },
  opts: { subjectId?: string | undefined; comments: 'all' | 'only' | 'none'; tags?: string[] | undefined },
): Promise<FeedItem[]> {
  const seen = await lastSeen(deps, ctx);
  const items: FeedItem[] = [];
  const subjectOk = (sid: string | null) => !opts.subjectId || sid === opts.subjectId;
  if (opts.comments !== 'only') {
    for (const m of await marksIn(deps.db, ctx.student.id, range)) {
      if (!subjectOk(m.subjectId)) continue;
      // tags come with M6: a filter by tags finds no mark until lessons carry them
      if (opts.tags?.length) continue;
      items.push({
        type: 'mark',
        id: m.id,
        date: m.date,
        subject: { id: m.subjectId, name: m.subjectName },
        mark: chipOf(ctx.scale, m),
        workType: m.workType,
        workTypeRaw: m.workTypeRaw,
        topic: m.topic,
        comment: m.comment,
        lessonId: m.lessonId,
        tagIds: [],
        isNew: !seen || m.firstSeenAt > seen,
      });
    }
  }
  if (opts.comments !== 'none' && !opts.tags?.length) {
    for (const r of await remarksIn(deps.db, ctx, range)) {
      if (!subjectOk(r.subjectId)) continue;
      items.push({
        type: 'comment',
        id: r.id,
        date: r.date,
        subject: r.subjectId && r.subjectName ? { id: r.subjectId, name: r.subjectName } : null,
        text: r.text,
        lessonId: r.lessonId,
        slot: r.slot,
      });
    }
  }
  if (opts.comments !== 'only' && !opts.tags?.length) {
    const since = new Date(ctx.now.getTime() - FEED_CHANGES_DAYS * 86_400_000);
    const changes = await deps.db
      .select({
        id: markEvents.id,
        kind: markEvents.kind,
        diff: markEvents.diff,
        createdAt: markEvents.createdAt,
        mark: marks,
        subjectName: subjects.name,
      })
      .from(markEvents)
      .innerJoin(marks, eq(marks.id, markEvents.markId))
      .innerJoin(subjects, eq(subjects.id, marks.subjectId))
      .where(and(eq(markEvents.studentId, ctx.student.id), gte(markEvents.createdAt, since)))
      .orderBy(desc(markEvents.createdAt));
    for (const c of changes) {
      if (c.kind !== 'changed' && c.kind !== 'removed') continue;
      if (c.mark.date < range.from || c.mark.date > range.to || !subjectOk(c.mark.subjectId)) continue;
      items.push({
        type: c.kind === 'changed' ? 'markChanged' : 'markRemoved',
        id: c.id,
        date: c.mark.date,
        subject: { id: c.mark.subjectId, name: c.subjectName },
        mark: chipOf(ctx.scale, c.mark),
        before: ((c.diff ?? {}) as MarkDiff).raw?.[0] ?? null,
        seenAt: c.createdAt,
      });
    }
  }
  const rank = { mark: 0, comment: 1, markChanged: 2, markRemoved: 2 } as const;
  return items.sort((a, b) => b.date.localeCompare(a.date) || rank[a.type] - rank[b.type]);
}

/** The subject of this child, or 404 */
async function subjectOf(deps: AppDeps, ctx: ChildContext, subjectId: string) {
  const [s] = await deps.db
    .select()
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.studentId, ctx.student.id)));
  if (!s) throw new HttpError(404, 'not_found', 'No such subject');
  return s;
}

async function trendOf(deps: AppDeps, ctx: ChildContext, q: z.infer<typeof periodQuery>, subjectId?: string) {
  const p = resolvePeriod(ctx, q);
  if (!p.instance || !ctx.scale) return { period: periodOf(p), buckets: [] };
  const scale = ctx.scale;
  const all = (await marksIn(deps.db, ctx.student.id))
    .filter((m) => !subjectId || m.subjectId === subjectId)
    .map(factOf);
  return {
    period: periodOf(p),
    buckets: trendBuckets(ctx.period, p.instance).map((b) => {
      const s = periodStats(scale, all, b);
      return { from: b.from, to: b.to, future: b.future, selected: b.selected, average: s.average, count: s.count };
    }),
  };
}

const trendResponse = registry.register(
  'Trend',
  z.object({
    period: periodOut,
    buckets: z.array(
      z.object({
        from: z.string(),
        to: z.string(),
        future: z.boolean(),
        selected: z.boolean(),
        average: z.number().nullable(),
        count: z.number(),
      }),
    ),
  }),
);

export function studentRoutes(deps: AppDeps): Router {
  const r = Router();
  const child = loadChild.bind(null, deps);

  route(
    r,
    {
      method: 'get',
      path: '/api/students',
      summary: '«С кого начнём?»: every child the person sees, with what the card shows, in one request',
      tags: ['students'],
      access: 'member',
      response: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          classLabel: z.string().nullable(),
          grade: z.number().nullable(),
          schoolLabel: z.string().nullable(),
          /** The children's schools differ: the card names the school (design.md 4) */
          showSchool: z.boolean(),
          hasMarks: z.boolean(),
          newCount: z.number(),
          week: comparison.nullable(),
          absencesWeek: z.number().nullable(),
          /**
           * A year without marks: the lessons and homework of the next school day instead (the next day with lessons
           * within two weeks, so a Saturday shows Monday); null with marks or without lessons ahead
           */
          nextDay: z.object({ date: z.string(), lessons: z.number(), homework: z.number() }).nullable(),
          now: nowLineSchema.nullable(),
          /** The nearest lesson with a tag (M6) */
          nearestTag: z.null(),
        }),
      ),
    },
    async (req) => {
      const m = memberOf(req);
      const kids = await visibleStudents(deps.db, m.userId, m.familyId);
      const schools = new Set(kids.map((k) => `${k.student.providerId}|${k.student.schoolId ?? ''}`));
      const showSchool = schools.size > 1 && kids.every((k) => k.student.schoolId);
      const cards = [];
      for (const { student } of kids) {
        const ctx = await child(req, student.id);
        const week = periodInstance(ctx.period, 'week', 0);
        let weekCmp = null;
        if (ctx.scale && week) {
          const all = (await marksIn(deps.db, student.id)).map(factOf);
          const prev = previousInstance(ctx.period, week);
          weekCmp = comparePeriods(
            ctx.scale,
            periodStats(ctx.scale, all, week),
            prev && periodStats(ctx.scale, all, prev),
          );
        }
        const seen = await lastSeen(deps, ctx);
        const newCount = (await marksIn(deps.db, student.id)).filter((x) => !seen || x.firstSeenAt > seen).length;
        const today = await lessonsIn(deps.db, ctx, { from: ctx.today, to: ctx.today });
        const ahead = ctx.scale
          ? []
          : (await lessonsIn(deps.db, ctx, { from: addDays(ctx.today, 1), to: addDays(ctx.today, 14) })).filter(
              (l) => !l.cancelled,
            );
        const nextDate = ahead.map((l) => l.date).sort()[0];
        const next = nextDate ? ahead.filter((l) => l.date === nextDate) : [];
        cards.push({
          id: student.id,
          name: childName(student),
          classLabel: student.classLabel,
          grade: student.grade,
          schoolLabel: student.schoolLabel ?? ctx.manifest.name,
          showSchool,
          hasMarks: !!ctx.scale,
          newCount,
          week: weekCmp,
          absencesWeek: week && ctx.caps.attendance !== 'none' ? (await absencesIn(deps.db, ctx, week)).length : null,
          nextDay: nextDate
            ? {
                date: nextDate,
                lessons: next.length,
                homework: next.filter((l) => l.homework || l.ownHomework.length).length,
              }
            : null,
          now: nowLine(today, localTime(ctx.now, ctx.timezone).minutes),
          nearestTag: null,
        });
      }
      return cards;
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/periods',
      summary: 'The period kinds the child has and every instance of each (the navigator)',
      tags: ['students'],
      access: 'member',
      params: childParams,
      response: z.object({
        today: z.string(),
        kinds: z.array(z.enum(['week', 'month', 'term', 'year'])),
        instances: z.record(z.string(), z.array(periodOut)),
      }),
      errors: { 404: 'No such child' },
    },
    async (req, { params }) => {
      const ctx = await child(req, params.id);
      const kinds = availableKinds(ctx.period);
      return {
        today: ctx.today,
        kinds,
        instances: Object.fromEntries(kinds.map((k: PeriodKind) => [k, listInstances(ctx.period, k).map(instanceOut)])),
      };
    },
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/students/:id/seen',
      summary: 'Everything of the child is seen now ("new" counts from here)',
      tags: ['students'],
      access: 'member',
      params: childParams,
      status: 204,
      response: null,
    },
    async (req, { params }) => {
      const ctx = await child(req, params.id);
      await deps.db
        .insert(userSeen)
        .values({ userId: ctx.userId, studentId: ctx.student.id, lastSeenAt: ctx.now })
        .onConflictDoUpdate({ target: [userSeen.userId, userSeen.studentId], set: { lastSeenAt: ctx.now } });
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/overview',
      summary: 'Главная: the period on the child scale, last day, movers, Внимание, next day, «Сейчас»',
      tags: ['students'],
      access: 'member',
      params: childParams,
      query: periodQuery,
      response: z.object({
        period: periodOut,
        hasMarks: z.boolean(),
        comparison: comparison.nullable(),
        marksCount: z.number(),
        bands: z.array(bandCount),
        absences: z.number().nullable(),
        newCount: z.number(),
        lastDay: z
          .object({ date: z.string(), marks: z.array(z.object({ subject: subjectRef, mark: markChip })) })
          .nullable(),
        movers: z.array(z.object({ subject: subjectRef, comparison, count: z.number() })),
        attention: z.array(childEvent),
        attentionTotal: z.number(),
        nextDay: z
          .object({
            date: z.string(),
            lessons: z.array(
              z.object({
                id: z.string(),
                slot: z.number().nullable(),
                start: z.string().nullable(),
                end: z.string().nullable(),
                subjectName: z.string(),
                room: z.string().nullable(),
                homework: z.string().nullable(),
                cancelled: z.boolean(),
              }),
            ),
          })
          .nullable(),
        now: nowLineSchema.nullable(),
      }),
      errors: { 404: 'No such child or period' },
    },
    async (req, { params, query }) => {
      const ctx = await child(req, params.id);
      const p = resolvePeriod(ctx, query);
      const range = { from: p.from, to: p.to };
      const all = await marksIn(deps.db, ctx.student.id);
      const inP = all.filter((x) => x.date >= p.from && x.date <= p.to);
      const prev = p.instance ? previousInstance(ctx.period, p.instance) : null;
      const scale = ctx.scale;
      const facts = all.map(factOf);
      const stats = scale ? periodStats(scale, facts, range) : null;
      const subjectRows = await subjectsOf(deps.db, ctx);
      const moved = scale
        ? movers(
            compareSubjects(
              scale,
              facts,
              subjectRows.map((s) => s.id),
              range,
              prev && { from: prev.from, to: prev.to },
            ),
          )
        : [];
      const seen = await lastSeen(deps, ctx);
      const lastDate = inP[0]?.date;
      const events = await childEvents(deps.db, ctx, p);
      const ahead = await lessonsIn(deps.db, ctx, { from: addDays(ctx.today, 1), to: addDays(ctx.today, 14) });
      const nextDate = ahead[0]?.date;
      const today = await lessonsIn(deps.db, ctx, { from: ctx.today, to: ctx.today });
      return {
        period: periodOf(p),
        hasMarks: !!scale,
        comparison: scale && stats ? comparePeriods(scale, stats, prev && periodStats(scale, facts, prev)) : null,
        marksCount: stats?.count ?? 0,
        bands: scale && stats ? bandsOf(scale, stats) : [],
        absences: ctx.caps.attendance === 'none' ? null : (await absencesIn(deps.db, ctx, range)).length,
        newCount: all.filter((x) => !seen || x.firstSeenAt > seen).length,
        lastDay: lastDate
          ? {
              date: lastDate,
              marks: inP
                .filter((x) => x.date === lastDate)
                .map((x) => ({ subject: { id: x.subjectId, name: x.subjectName }, mark: chipOf(scale, x) })),
            }
          : null,
        movers: moved.map((mv) => {
          const s = subjectRows.find((x) => x.id === mv.subjectId)!;
          const { subjectId: _s, count, ...cmp } = mv;
          return { subject: { id: s.id, name: s.name }, comparison: cmp, count };
        }),
        attention: events.slice(0, 5),
        attentionTotal: events.length,
        nextDay: nextDate
          ? {
              date: nextDate,
              lessons: ahead
                .filter((l) => l.date === nextDate)
                .map((l) => ({
                  id: l.id,
                  slot: l.slot,
                  start: l.start,
                  end: l.end,
                  subjectName: l.subjectName,
                  room: l.room,
                  homework: l.homework,
                  cancelled: l.cancelled,
                })),
            }
          : null,
        now: nowLine(today, localTime(ctx.now, ctx.timezone).minutes),
      };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/marks',
      summary: 'Оценки: marks and teacher comments by day, newest first (cursor pages)',
      tags: ['students'],
      access: 'member',
      params: childParams,
      query: periodQuery.extend({
        subject: id.optional(),
        /** all: marks and comments; only: the teacher's comments without a mark (D56); none: marks only */
        comments: z.enum(['all', 'only', 'none']).default('all'),
        tags: z.string().optional(),
        tagMode: z.enum(['any', 'all']).default('any'),
        cursor: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
      response: z.object({ period: periodOut, items: z.array(feedItem), next: z.number().nullable() }),
      errors: { 404: 'No such child or period' },
    },
    async (req, { params, query }) => {
      const ctx = await child(req, params.id);
      const p = resolvePeriod(ctx, query);
      const all = await feedItems(deps, ctx, p, {
        subjectId: query.subject,
        comments: query.comments,
        tags: query.tags?.split(',').filter(Boolean),
      });
      const page = all.slice(query.cursor, query.cursor + query.limit);
      const next = query.cursor + query.limit < all.length ? query.cursor + query.limit : null;
      return { period: periodOf(p), items: page, next };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/subjects',
      summary: 'Предметы: every subject with its average, direction, last marks and the child’s teacher and group',
      tags: ['students'],
      access: 'member',
      params: childParams,
      query: periodQuery.extend({ sort: z.enum(['alpha', 'weak', 'strong', 'fell', 'rose']).default('alpha') }),
      response: z.object({
        period: periodOut,
        subjects: z.array(
          z.object({
            subject: subjectInfoSchema,
            comparison: comparison.nullable(),
            count: z.number(),
            last: z.array(markChip),
            absences: z.number().nullable(),
          }),
        ),
      }),
      errors: { 404: 'No such child or period' },
    },
    async (req, { params, query }) => {
      const ctx = await child(req, params.id);
      const p = resolvePeriod(ctx, query);
      const range = { from: p.from, to: p.to };
      const rows = await subjectsOf(deps.db, ctx);
      const all = await marksIn(deps.db, ctx.student.id);
      const prev = p.instance ? previousInstance(ctx.period, p.instance) : null;
      const absences = ctx.caps.attendance === 'none' ? null : await absencesIn(deps.db, ctx, range);
      let order = rows.map((s) => s.id);
      const cmp = ctx.scale
        ? compareSubjects(ctx.scale, all.map(factOf), order, range, prev && { from: prev.from, to: prev.to })
        : [];
      if (ctx.scale && query.sort !== 'alpha') order = sortSubjects(ctx.scale, cmp, query.sort).map((c) => c.subjectId);
      return {
        period: periodOf(p),
        subjects: order.map((sid) => {
          const s = rows.find((x) => x.id === sid)!;
          const c = cmp.find((x) => x.subjectId === sid);
          const own = all.filter((m) => m.subjectId === sid && m.date >= p.from && m.date <= p.to);
          return {
            subject: subjectInfo(s),
            comparison: c ? (({ subjectId: _s, count: _c, ...rest }) => rest)(c) : null,
            count: c?.count ?? 0,
            last: own.slice(0, 5).map((m) => chipOf(ctx.scale, m)),
            absences: absences ? absences.filter((a) => a.subjectId === sid).length : null,
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
      summary: 'Предмет: stats, terms, distribution, the timeline of marks and teacher comments, the regular week',
      tags: ['students'],
      access: 'member',
      params: subjectParams,
      query: periodQuery,
      response: z.object({
        subject: subjectInfoSchema,
        period: periodOut,
        comparison: comparison.nullable(),
        bands: z.array(bandCount),
        distribution: z.array(z.object({ from: z.number(), to: z.number(), count: z.number() })),
        terms: z.array(
          z.object({
            id: z.string(),
            label: z.string(),
            from: z.string(),
            to: z.string(),
            average: z.number().nullable(),
            final: z.object({ raw: z.string(), mark: z.number().nullable() }).nullable(),
          }),
        ),
        timeline: z.array(feedItem),
        /** «Когда» in «О предмете» (5.4): the subject's lessons of the regular week */
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
      const p = resolvePeriod(ctx, query);
      const range = { from: p.from, to: p.to };
      const own = (await marksIn(deps.db, ctx.student.id)).filter((m) => m.subjectId === s.id);
      const facts = own.map(factOf);
      const prev = p.instance ? previousInstance(ctx.period, p.instance) : null;
      const scale = ctx.scale;
      const stats = scale ? periodStats(scale, facts, range) : null;
      const finals = await deps.db
        .select()
        .from(finalMarks)
        .where(
          and(eq(finalMarks.studentId, ctx.student.id), eq(finalMarks.subjectId, s.id), eq(finalMarks.role, 'final')),
        );
      const [template] = await deps.db
        .select()
        .from(weekTemplates)
        .where(eq(weekTemplates.studentId, ctx.student.id))
        .orderBy(desc(weekTemplates.fetchedAt))
        .limit(1);
      const inP = own.filter((m) => m.date >= p.from && m.date <= p.to);
      const values = inP.flatMap((m) => m.values);
      return {
        subject: subjectInfo(s),
        period: periodOf(p),
        comparison: scale && stats ? comparePeriods(scale, stats, prev && periodStats(scale, facts, prev)) : null,
        bands: scale && stats ? bandsOf(scale, stats) : [],
        distribution: scale
          ? distributionBuckets(scale).map((b) => ({
              ...b,
              count: values.filter((v) => v >= b.from && v <= b.to).length,
            }))
          : [],
        terms: ctx.termRows.map((t) => {
          const f = finals.find((x) => x.periodId === t.id);
          return {
            id: t.id,
            label: t.label,
            from: t.startDate,
            to: t.endDate,
            average: scale ? periodStats(scale, facts, { from: t.startDate, to: t.endDate }).average : null,
            final: f ? { raw: f.raw, mark: f.mark } : null,
          };
        }),
        timeline: await feedItems(deps, ctx, range, { subjectId: s.id, comments: 'all' }),
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
      path: '/api/students/:id/trend',
      summary: 'Динамика over all marks: the buckets of the selected period (TrendCard on Главная)',
      tags: ['students'],
      access: 'member',
      params: childParams,
      query: periodQuery,
      response: trendResponse,
      errors: { 404: 'No such child or period' },
    },
    async (req, { params, query }) => trendOf(deps, await child(req, params.id), query),
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/subjects/:subjectId/trend',
      summary: 'Динамика of one subject (TrendCard on Предмет)',
      tags: ['students'],
      access: 'member',
      params: subjectParams,
      query: periodQuery,
      response: trendResponse,
      errors: { 404: 'No such child, subject or period' },
    },
    async (req, { params, query }) => {
      const ctx = await child(req, params.id);
      const s = await subjectOf(deps, ctx, params.subjectId);
      return trendOf(deps, ctx, query, s.id);
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/absences',
      summary: 'Absences of a period (empty where the provider has no attendance)',
      tags: ['students'],
      access: 'member',
      params: childParams,
      query: periodQuery,
      response: z.object({
        period: periodOut,
        items: z.array(
          z.object({
            id: z.string(),
            date: z.string(),
            status: z.string(),
            excused: z.boolean().nullable(),
            code: z.string().nullable(),
            subject: subjectRef.nullable(),
            lessonId: z.string().nullable(),
          }),
        ),
      }),
      errors: { 404: 'No such child or period' },
    },
    async (req, { params, query }) => {
      const ctx = await child(req, params.id);
      const p = resolvePeriod(ctx, query);
      const rows = await absencesIn(deps.db, ctx, p);
      return {
        period: periodOf(p),
        items: rows.map((a) => ({
          id: a.id,
          date: a.date,
          status: a.status,
          excused: a.excused,
          code: a.code,
          subject: a.subjectId && a.subjectName ? { id: a.subjectId, name: a.subjectName } : null,
          lessonId: a.lessonId,
        })),
      };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/events',
      summary: 'Внимание: ranked facts of the period; Главная shows the first five of the same list',
      tags: ['students'],
      access: 'member',
      params: childParams,
      query: periodQuery.extend({
        skip: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }),
      response: z.object({ period: periodOut, items: z.array(childEvent), total: z.number() }),
      errors: { 404: 'No such child or period' },
    },
    async (req, { params, query }) => {
      const ctx = await child(req, params.id);
      const p = resolvePeriod(ctx, query);
      const all = await childEvents(deps.db, ctx, p);
      return { period: periodOf(p), items: all.slice(query.skip, query.skip + query.limit), total: all.length };
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/students/:id/school',
      summary: 'Школа: the child’s bells, terms and holidays of the current school year (design.md 5.9)',
      tags: ['students'],
      access: 'member',
      params: childParams,
      response: z.object({
        timezone: z.string(),
        year: z.object({ label: z.string(), from: z.string(), to: z.string() }).nullable(),
        terms: z.array(
          z.object({
            id: z.string(),
            kind: z.string(),
            index: z.number(),
            label: z.string(),
            from: z.string(),
            to: z.string(),
            note: z.string().nullable(),
          }),
        ),
        holidays: z.array(z.object({ from: z.string(), to: z.string(), note: z.string().nullable() })),
        bells: z.array(
          z.object({
            label: z.string().nullable(),
            days: z.array(z.number()),
            periods: z.array(z.object({ slot: z.number(), start: z.string(), end: z.string() })),
          }),
        ),
      }),
      errors: { 404: 'No such child' },
    },
    async (req, { params }) => {
      const ctx = await child(req, params.id);
      const bells = ctx.year
        ? await deps.db
            .select()
            .from(bellSchedules)
            .where(and(eq(bellSchedules.studentId, ctx.student.id), inArray(bellSchedules.schoolYearId, [ctx.year.id])))
        : [];
      return {
        timezone: ctx.timezone,
        year: ctx.year ? { label: ctx.year.label, from: ctx.year.startDate, to: ctx.year.endDate } : null,
        terms: ctx.termRows.map((t) => ({
          id: t.id,
          kind: t.kind,
          index: t.index,
          label: t.label,
          from: t.startDate,
          to: t.endDate,
          note: t.note,
        })),
        holidays: ctx.holidayRows.map((h) => ({ from: h.start, to: h.end, note: h.note })),
        bells: bells.map((b) => ({ label: b.label, days: b.days, periods: b.periods })),
      };
    },
  );

  return r;
}
