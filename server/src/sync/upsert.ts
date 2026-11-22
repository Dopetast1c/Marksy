import type { Attendance, BehaviourEvent, DateRange, ISODate, Lesson, Mark } from '@marksy/core';
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
//
// Records accumulate (D61). New records and changed values are always applied; a stored record leaves only when the
// diary clearly deleted that one record: its date is in no finished term (those are frozen), its lesson came back in
// this response, and the response does not drop all or many records at once. When it would (a closed term's weeks come
// back empty, a response without its marks), the unit removes nothing at all and is held: the collector keeps the week
// unverified, records a mass_removal drift and asks for it again at most once a day.

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface UpsertScope {
  studentId: string;
  providerId: string;
  schoolYearId: string;
  now: Date;
  /** Subject external id -> subjects.id for this student and year; unknown subjects are added on the way */
  subjectIds: Map<string, string>;
  /**
   * The end of the last term that finished before today: records dated on or before it are frozen and never removed,
   * whatever triggered the read (a manual re-check included). Null when no term has finished.
   */
  frozenUntil?: ISODate | null;
}

export interface UpsertStats {
  lessons: number;
  new: number;
  changed: number;
  removed: number;
  restored: number;
}

/** What one record kind of a unit would remove; applied only when no kind of the unit trips the guard */
interface Removal {
  table: GuardedTable;
  /** Active stored records of the range that are not frozen */
  stored: number;
  /** Of these, the ones missing from the response */
  missing: number;
  /** Of the missing, the ones the diary clearly deleted (their lesson is in the response) */
  ids: string[];
  /** Active frozen records of the range missing from the response: kept */
  frozenMissing: number;
}

/** Active records of the range missing from the response, split into what may go and what is frozen */
function missingOf<T extends { removedAt: Date | null; date: ISODate }>(
  scope: UpsertScope,
  range: DateRange,
  existing: readonly T[],
  present: (row: T) => boolean,
) {
  const active = existing.filter((r) => !r.removedAt && r.date >= range.from && r.date <= range.to);
  const stored = active.filter((r) => !frozen(scope, r.date));
  return {
    stored,
    gone: stored.filter((r) => !present(r)),
    frozenMissing: active.filter((r) => frozen(scope, r.date) && !present(r)).length,
  };
}

export type GuardedTable = 'lessons' | 'marks' | 'attendance' | 'behaviour';

/**
 * The mass-removal guard (design.md 8): more missing records than this in one fetched unit, or all of at least two,
 * and the unit removes nothing. Marks and remarks: one per lesson; a teacher deletes a wrong one at a time, so three
 * gone from one child's week at once is a response that lost them, not an edit. Lessons: a school day (eight slots)
 * may be cancelled after the fact, more may not. Absences: a day's worth (six).
 */
export const REMOVAL_LIMITS: Record<GuardedTable, number> = { lessons: 8, marks: 2, attendance: 6, behaviour: 2 };

export const tripsGuard = (r: Pick<Removal, 'table' | 'stored' | 'missing'>) =>
  r.missing > REMOVAL_LIMITS[r.table] || (r.stored >= 2 && r.missing === r.stored);

export interface UpsertResult extends UpsertStats {
  /** The record kinds that tripped the mass-removal guard; empty when the unit's removals were applied */
  held: GuardedTable[];
  /**
   * Records of a finished term missing from the response (kept, frozen): the response is not a good copy of the week,
   * so it does not replace the body kept for it (collector.ts, retention.ts)
   */
  frozenMissing: number;
}

const frozen = (scope: UpsertScope, date: ISODate) => !!scope.frozenUntil && date <= scope.frozenUntil;

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

  // gone from a re-fetched range under both keys: soft-deleted later (applyRemovals), never dropped
  const { stored, gone, frozenMissing } = missingOf(scope, fetched.range, existing, (l) => matched.has(l.id));
  const removal: Removal = {
    table: 'lessons',
    stored: stored.length,
    missing: gone.length,
    ids: gone.map((l) => l.id),
    frozenMissing,
  };
  return { lessonIds, matched, removal };
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
  matchedLessons: ReadonlySet<string>,
  stats: UpsertStats,
): Promise<Removal> {
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

  if (events.length) await tx.insert(markEvents).values(events);
  const { stored, gone, frozenMissing } = missingOf(scope, fetched.range, existing, (m) => seen.has(m.externalId));
  // the diary clearly deleted this one mark: its lesson came back (without it); a mark without a lesson (a gradebook)
  // only while the response still has other marks
  const deleted = gone.filter((m) => (m.lessonId ? matchedLessons.has(m.lessonId) : seen.size > 0));
  return { table: 'marks', stored: stored.length, missing: gone.length, ids: deleted.map((m) => m.id), frozenMissing };
}

/** A missing absence or remark the diary clearly deleted: its lesson came back, or it never had one */
const clearlyDeleted = (lessonId: string | null, matchedLessons: ReadonlySet<string>) =>
  !lessonId || matchedLessons.has(lessonId);

async function upsertAttendance(
  tx: Tx,
  scope: UpsertScope,
  fetched: FetchedRange,
  lessonIds: Map<string, string>,
  matchedLessons: ReadonlySet<string>,
): Promise<Removal> {
  const { studentId, providerId, now } = scope;
  const all = [
    ...fetched.lessons.flatMap((l) => (l.attendance ?? []).map((a) => ({ a, source: 'derived' as const }))),
    ...fetched.attendance.map((a) => ({ a, source: 'separate' as const })),
  ];
  const existing = await tx
    .select({
      id: attendance.id,
      externalId: attendance.externalId,
      removedAt: attendance.removedAt,
      date: attendance.date,
      lessonId: attendance.lessonId,
    })
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
  const { stored, gone, frozenMissing } = missingOf(scope, fetched.range, existing, (a) => seen.has(a.externalId));
  const ids = gone.filter((a) => clearlyDeleted(a.lessonId, matchedLessons)).map((a) => a.id);
  return { table: 'attendance', stored: stored.length, missing: gone.length, ids, frozenMissing };
}

/**
 * Teacher remarks and behaviour events of the range, like attendance: upserted by id, soft-removed when the range no
 * longer has them, back when they return. A comment that changes is kept as it is now.
 */
async function upsertBehaviour(
  tx: Tx,
  scope: UpsertScope,
  fetched: FetchedRange,
  lessonIds: Map<string, string>,
  matchedLessons: ReadonlySet<string>,
): Promise<Removal> {
  const { studentId, providerId, now } = scope;
  const all = [...fetched.lessons.flatMap((l) => l.behaviour ?? []), ...(fetched.behaviour ?? [])];
  const existing = await tx
    .select({
      id: behaviourEvents.id,
      externalId: behaviourEvents.externalId,
      removedAt: behaviourEvents.removedAt,
      date: behaviourEvents.date,
      lessonId: behaviourEvents.lessonId,
    })
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
  const { stored, gone, frozenMissing } = missingOf(scope, fetched.range, existing, (b) => seen.has(b.externalId));
  const ids = gone.filter((b) => clearlyDeleted(b.lessonId, matchedLessons)).map((b) => b.id);
  return { table: 'behaviour', stored: stored.length, missing: gone.length, ids, frozenMissing };
}

/** The removals of a unit that tripped no guard: soft-deleted, a 'removed' event per mark */
async function applyRemovals(tx: Tx, scope: UpsertScope, removals: Removal[], stats: UpsertStats) {
  const { studentId, now } = scope;
  for (const r of removals) {
    if (!r.ids.length) continue;
    if (r.table === 'lessons') await tx.update(lessons).set({ removedAt: now }).where(inArray(lessons.id, r.ids));
    if (r.table === 'attendance')
      await tx.update(attendance).set({ removedAt: now }).where(inArray(attendance.id, r.ids));
    if (r.table === 'behaviour')
      await tx.update(behaviourEvents).set({ removedAt: now }).where(inArray(behaviourEvents.id, r.ids));
    if (r.table === 'marks') {
      await tx.update(marks).set({ removedAt: now }).where(inArray(marks.id, r.ids));
      await tx
        .insert(markEvents)
        .values(r.ids.map((markId) => ({ studentId, markId, kind: 'removed' as const, createdAt: now })));
      stats.removed += r.ids.length;
    }
  }
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
export async function upsertRange(db: Db, scope: UpsertScope, fetched: FetchedRange): Promise<UpsertResult> {
  const stats: UpsertStats = { lessons: 0, new: 0, changed: 0, removed: 0, restored: 0 };
  let held: GuardedTable[] = [];
  let frozenMissing = 0;
  // subjects added inside a transaction that rolls back must not stay in the cache
  const subjectIds = new Map(scope.subjectIds);
  await db.transaction(async (tx) => {
    const txScope = { ...scope, subjectIds };
    const { lessonIds, matched, removal } = await upsertLessons(tx, txScope, fetched, stats);
    const removals = [
      removal,
      await upsertMarks(tx, txScope, fetched, lessonIds, matched, stats),
      await upsertAttendance(tx, txScope, fetched, lessonIds, matched),
      await upsertBehaviour(tx, txScope, fetched, lessonIds, matched),
    ];
    held = removals.filter(tripsGuard).map((r) => r.table);
    frozenMissing = removals.reduce((n, r) => n + r.frozenMissing, 0);
    // one kind that lost too much makes the whole response suspect: nothing of the unit is removed
    if (!held.length) await applyRemovals(tx, txScope, removals, stats);
    await dropOverriddenByDiary(tx, txScope, fetched);
  });
  for (const [k, v] of subjectIds) scope.subjectIds.set(k, v);
  return { ...stats, held, frozenMissing };
}
