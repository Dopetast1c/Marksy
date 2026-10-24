import { periodStats, projectFinal } from '@marksy/core';
import type { MarkKind } from '@marksy/core';
import { and, desc, eq, gte } from 'drizzle-orm';
import { z } from 'zod';
import { markEvents, marks, subjects, userSeen } from '../db/schema';
import type { MarkDiff } from '../db/schema';
import type { AppDeps } from '../http/context';
import { registry } from '../openapi';
import { markChip, subjectRef, termRefOut } from '../routes/read-schemas';
import type { ChildContext } from './context';
import { absencesIn, chipOf, factOf, marksIn, refOf, refOrNull, remarksIn, subjectsOf } from './data';
import { finalsOf, postedOn, termRef } from './finals';

// The feed of Оценки and the timeline of a subject (docs/design.md 5.3, 5.4): marks by day, newest first; in a day the
// finals card, the marks, the absences (quiet rows, never marks), the teacher's comments without a mark (D56), then
// the changes of the last 14 days.

const FEED_CHANGES_DAYS = 14;

export const feedItem = registry.register(
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
    /** An absence (attendance, never a mark; only with the attendance capability): a quiet row after the day's marks */
    z.object({
      type: z.literal('absence'),
      id: z.string(),
      date: z.string(),
      subject: subjectRef.nullable(),
      /** The diary's code («н»), shown in a dashed frame instead of a chip */
      code: z.string().nullable(),
      excused: z.boolean().nullable(),
      lessonId: z.string().nullable(),
    }),
    /** A term's finals on the day they were posted (5.3): one card, never in the averages */
    z.object({
      type: z.literal('finals'),
      id: z.string(),
      date: z.string(),
      term: termRefOut,
      marks: z.array(z.object({ subject: subjectRef, mark: markChip })),
      /** How many finals differ from the rounded term average */
      differ: z.number(),
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

export type FeedItem = z.infer<typeof feedItem>;

export async function lastSeen(deps: AppDeps, ctx: ChildContext): Promise<Date | null> {
  const [row] = await deps.db
    .select({ at: userSeen.lastSeenAt })
    .from(userSeen)
    .where(and(eq(userSeen.userId, ctx.userId), eq(userSeen.studentId, ctx.student.id)));
  return row?.at ?? null;
}

/** Marks and teacher comments of one child, newest day first; in a day the marks, then the comments, then changes */
export async function feedItems(
  deps: AppDeps,
  ctx: ChildContext,
  range: { from: string; to: string },
  opts: {
    subjectId?: string | undefined;
    comments: 'all' | 'only' | 'none';
    tags?: string[] | undefined;
    /** Оценки: absences as quiet rows and the finals card on the day they were posted */
    feed?: boolean;
  },
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
        subject: refOf(ctx, m.subjectId, m.subjectName),
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
        subject: refOrNull(ctx, r.subjectId, r.subjectName),
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
        subject: refOf(ctx, c.mark.subjectId, c.subjectName),
        mark: chipOf(ctx.scale, c.mark),
        before: ((c.diff ?? {}) as MarkDiff).raw?.[0] ?? null,
        seenAt: c.createdAt,
      });
    }
  }
  // only on the unfiltered feed: a filter by tags or to the comments shows what it names
  const plain = opts.feed && !opts.subjectId && opts.comments !== 'only' && !opts.tags?.length;
  if (plain) {
    for (const a of await absencesIn(deps.db, ctx, range)) {
      items.push({
        type: 'absence',
        id: a.id,
        date: a.date,
        subject: refOrNull(ctx, a.subjectId, a.subjectName),
        code: a.code,
        excused: a.excused,
        lessonId: a.lessonId,
      });
    }
    items.push(...(await finalsCards(deps, ctx, range)));
  }
  const rank = { finals: -1, mark: 0, absence: 1, comment: 2, markChanged: 3, markRemoved: 3 } as const;
  return items.sort((a, b) => b.date.localeCompare(a.date) || rank[a.type] - rank[b.type]);
}

/** One card per term whose finals were posted inside the range (design.md 5.3): a posted final is a mark event */
async function finalsCards(deps: AppDeps, ctx: ChildContext, range: { from: string; to: string }): Promise<FeedItem[]> {
  if (!ctx.caps.finalMarks) return [];
  const finals = (await finalsOf(deps.db, ctx)).filter((f) => f.periodId && f.subjectId);
  if (!finals.length) return [];
  const facts = (await marksIn(deps.db, ctx.student.id)).map(factOf);
  const subjectRows = await subjectsOf(deps.db, ctx);
  const out: FeedItem[] = [];
  for (const t of ctx.termRows) {
    const own = finals.filter((f) => f.periodId === t.id);
    const days = own.map((f) => postedOn(f, ctx.timezone)).filter((d): d is string => d != null);
    const date = days.sort().at(-1);
    if (!own.length || !date || date < range.from || date > range.to) continue;
    const rounded = (subjectId: string) =>
      ctx.scale
        ? projectFinal(
            ctx.scale,
            periodStats(
              ctx.scale,
              facts.filter((m) => m.subjectId === subjectId),
              { from: t.startDate, to: t.endDate },
            ).average,
          )
        : null;
    const named = own
      .map((f) => ({ f, s: subjectRows.find((x) => x.id === f.subjectId) }))
      .filter((x) => x.s)
      .sort((a, b) => a.s!.name.localeCompare(b.s!.name));
    out.push({
      type: 'finals',
      id: 'finals-' + t.id,
      date,
      term: termRef(t),
      marks: named.map(({ f, s }) => ({
        subject: refOf(ctx, s!.id, s!.name),
        mark: chipOf(ctx.scale, {
          id: f.id,
          values: f.mark == null ? [] : [f.mark],
          raw: f.raw,
          kind: f.kind as MarkKind,
        }),
      })),
      differ: named.filter(({ f }) => f.mark != null && f.mark !== rounded(f.subjectId!)).length,
    });
  }
  return out;
}
