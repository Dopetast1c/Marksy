import type { Attendance, BehaviourEvent, DateRange, Lesson, Mark } from '@marksy/core';
import { and, eq, gte, inArray, lte, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  attendance,
  behaviourEvents,
  lessonOverrides,
  lessons,
  markEvents,
  markHistory,
  marks,
  subjects,
} from '../db/schema';
import type { MarkDiff } from '../db/schema';

// The upsert rules of docs/design.md 8, applied to one fetched range of one student, whatever the run kind. A range is
// stored completely or not at all (one transaction), so a week is either verified or untouched.

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface UpsertScope {
  studentId: string;
  providerId: string;
  schoolYearId: string;
  now: Date;
  /** Subject external id -> subjects.id for this student and year; unknown subjects are added on the way */
  subjectIds: Map<string, string>;
}

export interface UpsertStats {
  lessons: number;
  new: number;
  changed: number;
  removed: number;
  restored: number;
}

export interface FetchedRange {
  range: DateRange;
  lessons: Lesson[];
  /** Marks not attached to lessons (gradebook systems) */
  marks: Mark[];
  /** capabilities.attendance = 'separate' */
  attendance: Attendance[];
  /** capabilities.behaviour = 'separate'; with 'derived' they come on the lessons */
  behaviour?: BehaviourEvent[];
}

export const normName = (name: string) => name.toLowerCase().replace(/\s+/g, ' ').trim();

async function subjectId(tx: Tx, scope: UpsertScope, externalId: string, name: string): Promise<string> {
  const known = scope.subjectIds.get(externalId);
  if (known) return known;
  const [row] = await tx
    .insert(subjects)
    .values({
      studentId: scope.studentId,
      schoolYearId: scope.schoolYearId,
      providerId: scope.providerId,
      externalId,
      name,
      nameNorm: normName(name),
    })
    .onConflictDoUpdate({
      target: [subjects.studentId, subjects.schoolYearId, subjects.providerId, subjects.externalId],
      set: { name, nameNorm: normName(name) },
    })
    .returning({ id: subjects.id });
  scope.subjectIds.set(externalId, row!.id);
  return row!.id;
}

type LessonRow = typeof lessons.$inferSelect;

/** The natural key of design 8: (student, date, slot, subject); the start time stands in when there is no slot. */
const naturalKey = (date: string, subject: string, slot: number | null | undefined, start: string | null | undefined) =>
  `${date}|${subject}|${slot ?? `t${start ?? ''}`}`;

async function upsertLessons(tx: Tx, scope: UpsertScope, fetched: FetchedRange, stats: UpsertStats) {
  const { studentId, providerId, now } = scope;
  const ids = fetched.lessons.map((l) => l.externalId);
  const existing = await tx
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.studentId, studentId),
        eq(lessons.providerId, providerId),
        or(
          and(gte(lessons.date, fetched.range.from), lte(lessons.date, fetched.range.to)),
          ids.length ? inArray(lessons.externalId, ids) : undefined,
        ),
      ),
    );
  const byExternal = new Map(existing.map((l) => [l.externalId, l]));
  const byNatural = new Map(existing.map((l) => [naturalKey(l.date, l.subjectId, l.slot, l.startTime), l]));
  const matched = new Set<string>();
  /** lesson external id -> lessons.id, for the marks and absences of this range */
  const lessonIds = new Map<string, string>();

  for (const l of fetched.lessons) {
    const subject = await subjectId(tx, scope, l.subjectExternalId, l.subjectName);
    let row: LessonRow | undefined = byExternal.get(l.externalId);
    // a lesson whose id changed (null, then a real one) is the same lesson: it keeps its row, ticks and history
    if (!row || matched.has(row.id)) {
      const candidate = byNatural.get(naturalKey(l.date, subject, l.slot, l.startTime));
      row = candidate && !matched.has(candidate.id) && !ids.includes(candidate.externalId) ? candidate : undefined;
    }
    const values = {
      externalId: l.externalId,
      date: l.date,
      slot: l.slot ?? null,
      startTime: l.startTime ?? null,
      endTime: l.endTime ?? null,
      subjectId: subject,
      subjectName: l.subjectName,
      teacherExternalId: l.teacherExternalId ?? null,
      teacherName: l.teacherName ?? null,
      // what the diary sends; the rest comes from the regular week once a day (details.ts)
      room: l.room ?? null,
      groupLabel: l.groupLabel ?? null,
      templateRef: l.templateRef ?? null,
      lessonType: l.lessonType ?? null,
      topic: l.topic ?? null,
      homework: l.homework ?? null,
      homeworkDueDate: l.homeworkDueDate ?? null,
      hasAttachments: l.hasAttachments ?? false,
      cancelled: l.cancelled ?? false,
      fetchedAt: now,
      removedAt: null,
    };
    if (row) {
      await tx.update(lessons).set(values).where(eq(lessons.id, row.id));
      matched.add(row.id);
      lessonIds.set(l.externalId, row.id);
    } else {
      const [created] = await tx
        .insert(lessons)
        .values({ ...values, studentId, providerId, firstSeenAt: now })
        .returning({ id: lessons.id });
      matched.add(created!.id);
      lessonIds.set(l.externalId, created!.id);
    }
    stats.lessons++;
  }

  // gone from a re-fetched range under both keys: soft-deleted, never dropped
  const gone = existing.filter(
    (l) => !matched.has(l.id) && !l.removedAt && l.date >= fetched.range.from && l.date <= fetched.range.to,
  );
  if (gone.length) {
    await tx
      .update(lessons)
      .set({ removedAt: now })
      .where(
        inArray(
          lessons.id,
          gone.map((l) => l.id),
        ),
      );
  }
  return lessonIds;
}

type MarkRow = typeof marks.$inferSelect;

function diffOf(old: MarkRow, m: Mark): MarkDiff | null {
  const diff: MarkDiff = {};
  if (old.raw !== m.raw) diff.raw = [old.raw, m.raw];
  if (old.kind !== m.kind) diff.kind = [old.kind, m.kind];
  if ((old.workType ?? null) !== (m.workType ?? null)) diff.workType = [old.workType, m.workType ?? null];
  if ((old.comment ?? null) !== (m.comment ?? null)) diff.comment = [old.comment, m.comment ?? null];
  return Object.keys(diff).length ? diff : null;
}

async function upsertMarks(
  tx: Tx,
  scope: UpsertScope,
  fetched: FetchedRange,
  lessonIds: Map<string, string>,
  stats: UpsertStats,
) {
  const { studentId, providerId, now } = scope;
  const all = [...fetched.lessons.flatMap((l) => l.marks), ...fetched.marks];
  const ids = all.map((m) => m.externalId);
  const existing = await tx
    .select()
    .from(marks)
    .where(
      and(
        eq(marks.studentId, studentId),
        eq(marks.providerId, providerId),
        or(
          and(gte(marks.date, fetched.range.from), lte(marks.date, fetched.range.to)),
          ids.length ? inArray(marks.externalId, ids) : undefined,
        ),
      ),
    );
  const byExternal = new Map(existing.map((m) => [m.externalId, m]));
  const seen = new Set<string>();
  const events: (typeof markEvents.$inferInsert)[] = [];

  for (const m of all) {
    if (seen.has(m.externalId)) continue;
    seen.add(m.externalId);
    const values = {
      lessonId: (m.lessonExternalId && lessonIds.get(m.lessonExternalId)) || null,
      date: m.date,
      postedAt: m.postedAt ?? null,
      subjectId: await subjectId(tx, scope, m.subjectExternalId, m.subjectName),
      raw: m.raw,
      kind: m.kind,
      values: m.values,
      scaleId: m.scaleId ?? null,
      workType: m.workType ?? null,
      workTypeRaw: m.workTypeRaw ?? null,
      title: m.title ?? null,
      assessmentType: m.assessmentType ?? null,
      dimension: m.dimension ?? null,
      criterion: m.criterion ?? null,
      weight: m.weight ?? null,
      maxPoints: m.maxPoints ?? null,
      modifier: m.modifier ?? null,
      status: m.status ?? null,
      cohort: m.cohort ?? null,
      comment: m.comment ?? null,
      lastSeenAt: now,
      removedAt: null,
    };
    const old = byExternal.get(m.externalId);
    if (!old) {
      const [created] = await tx
        .insert(marks)
        .values({ ...values, studentId, providerId, externalId: m.externalId, firstSeenAt: now })
        .returning({ id: marks.id });
      events.push({ studentId, markId: created!.id, kind: 'new', createdAt: now });
      stats.new++;
      continue;
    }
    const diff = diffOf(old, m);
    if (diff) {
      // the previous version goes to history before it is overwritten
      await tx.insert(markHistory).values({
        markId: old.id,
        seenAt: old.lastSeenAt,
        rawMark: old.raw,
        kind: old.kind,
        workType: old.workType,
        comment: old.comment,
      });
      events.push({ studentId, markId: old.id, kind: 'changed', diff, createdAt: now });
      stats.changed++;
    }
    if (old.removedAt) {
      events.push({ studentId, markId: old.id, kind: 'restored', createdAt: now });
      stats.restored++;
    }
    await tx
      .update(marks)
      .set({ ...values, ...(diff && { changedAt: now }) })
      .where(eq(marks.id, old.id));
  }

  const gone = existing.filter(
    (m) => !seen.has(m.externalId) && !m.removedAt && m.date >= fetched.range.from && m.date <= fetched.range.to,
  );
  if (gone.length) {
    await tx
      .update(marks)
      .set({ removedAt: now })
      .where(
        inArray(
          marks.id,
          gone.map((m) => m.id),
        ),
      );
    for (const m of gone) events.push({ studentId, markId: m.id, kind: 'removed', createdAt: now });
    stats.removed += gone.length;
  }
  if (events.length) await tx.insert(markEvents).values(events);
}

async function upsertAttendance(tx: Tx, scope: UpsertScope, fetched: FetchedRange, lessonIds: Map<string, string>) {
  const { studentId, providerId, now } = scope;
  const all = [
    ...fetched.lessons.flatMap((l) => (l.attendance ?? []).map((a) => ({ a, source: 'derived' as const }))),
    ...fetched.attendance.map((a) => ({ a, source: 'separate' as const })),
  ];
  const existing = await tx
    .select({ id: attendance.id, externalId: attendance.externalId, removedAt: attendance.removedAt })
    .from(attendance)
    .where(
      and(
        eq(attendance.studentId, studentId),
        eq(attendance.providerId, providerId),
        gte(attendance.date, fetched.range.from),
        lte(attendance.date, fetched.range.to),
      ),
    );
  const seen = new Set<string>();
  for (const { a, source } of all) {
    if (seen.has(a.externalId)) continue;
    seen.add(a.externalId);
    const values = {
      date: a.date,
      lessonId: (a.lessonExternalId && lessonIds.get(a.lessonExternalId)) || null,
      subjectId: a.subjectExternalId ? (scope.subjectIds.get(a.subjectExternalId) ?? null) : null,
      status: a.status,
      excused: a.excused ?? null,
      code: a.code ?? null,
      minutes: a.minutes ?? null,
      reason: a.reason ?? null,
      source,
      removedAt: null,
    };
    await tx
      .insert(attendance)
      .values({ ...values, studentId, providerId, externalId: a.externalId, firstSeenAt: now })
      .onConflictDoUpdate({
        target: [attendance.studentId, attendance.providerId, attendance.externalId],
        set: values,
      });
  }
  const gone = existing.filter((a) => !seen.has(a.externalId) && !a.removedAt).map((a) => a.id);
  if (gone.length) await tx.update(attendance).set({ removedAt: now }).where(inArray(attendance.id, gone));
}

/**
 * Teacher remarks and behaviour events of the range, like attendance: upserted by id, soft-removed when the range no
 * longer has them, back when they return. A comment that changes is kept as it is now.
 */
async function upsertBehaviour(tx: Tx, scope: UpsertScope, fetched: FetchedRange, lessonIds: Map<string, string>) {
  const { studentId, providerId, now } = scope;
  const all = [...fetched.lessons.flatMap((l) => l.behaviour ?? []), ...(fetched.behaviour ?? [])];
  const existing = await tx
    .select({ id: behaviourEvents.id, externalId: behaviourEvents.externalId, removedAt: behaviourEvents.removedAt })
    .from(behaviourEvents)
    .where(
      and(
        eq(behaviourEvents.studentId, studentId),
        eq(behaviourEvents.providerId, providerId),
        gte(behaviourEvents.date, fetched.range.from),
        lte(behaviourEvents.date, fetched.range.to),
      ),
    );
  const seen = new Set<string>();
  for (const b of all) {
    if (seen.has(b.externalId)) continue;
    seen.add(b.externalId);
    const values = {
      date: b.date,
      points: b.points ?? null,
      polarity: b.polarity,
      category: b.category ?? null,
      comment: b.comment ?? null,
      subjectId: b.subjectExternalId ? (scope.subjectIds.get(b.subjectExternalId) ?? null) : null,
      lessonId: (b.lessonExternalId && lessonIds.get(b.lessonExternalId)) || null,
      authorExternalId: b.authorExternalId ?? null,
      removedAt: null,
    };
    await tx
      .insert(behaviourEvents)
      .values({ ...values, studentId, providerId, externalId: b.externalId, firstSeenAt: now })
      .onConflictDoUpdate({
        target: [behaviourEvents.studentId, behaviourEvents.providerId, behaviourEvents.externalId],
        set: values,
      });
  }
  const gone = existing.filter((b) => !seen.has(b.externalId) && !b.removedAt).map((b) => b.id);
  if (gone.length) await tx.update(behaviourEvents).set({ removedAt: now }).where(inArray(behaviourEvents.id, gone));
}

/**
 * "Lesson won't take place" (lessonMenu.cancel) gives way to the diary (docs/design.md 5.5): once the diary records a mark or an attendance record
 * for a lesson the family cancelled, the lesson took place, so the override goes, silently. A planned topic does not
 * count: the diary shows topics ahead.
 */
async function dropOverriddenByDiary(tx: Tx, { studentId }: UpsertScope, fetched: FetchedRange) {
  await tx.delete(lessonOverrides).where(
    and(
      eq(lessonOverrides.studentId, studentId),
      inArray(
        lessonOverrides.lessonId,
        sql`(select l.id from ${lessons} l where l.student_id = ${studentId}
          and l.date between ${fetched.range.from} and ${fetched.range.to}
          and (exists (select 1 from ${marks} m where m.lesson_id = l.id and m.removed_at is null)
            or exists (select 1 from ${attendance} a where a.lesson_id = l.id and a.removed_at is null)))`,
      ),
    ),
  );
}

/** Store one fetched range of one student: lessons, then marks, absences and remarks pointing at them. */
export async function upsertRange(db: Db, scope: UpsertScope, fetched: FetchedRange): Promise<UpsertStats> {
  const stats: UpsertStats = { lessons: 0, new: 0, changed: 0, removed: 0, restored: 0 };
  // subjects added inside a transaction that rolls back must not stay in the cache
  const subjectIds = new Map(scope.subjectIds);
  await db.transaction(async (tx) => {
    const txScope = { ...scope, subjectIds };
    const lessonIds = await upsertLessons(tx, txScope, fetched, stats);
    await upsertMarks(tx, txScope, fetched, lessonIds, stats);
    await upsertAttendance(tx, txScope, fetched, lessonIds);
    await upsertBehaviour(tx, txScope, fetched, lessonIds);
    await dropOverriddenByDiary(tx, txScope, fetched);
  });
  for (const [k, v] of subjectIds) scope.subjectIds.set(k, v);
  return stats;
}
