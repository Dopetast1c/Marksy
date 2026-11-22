import { weekStartOf } from '@marksy/core';
import type { DiaryProvider, ISODate } from '@marksy/core';
import { getProvider } from '@marksy/registry';
import { and, asc, desc, eq, gt, inArray, isNotNull, isNull } from 'drizzle-orm';
import {
  attendance,
  behaviourEvents,
  finalMarksRaw,
  lessons,
  markEvents,
  marks,
  rawResponses,
  schoolYears,
  students,
  subjects,
  terms,
} from '../db/schema';
import { log } from '../log';
import { localTime } from '../sync/time';
import { writeFinals } from '../sync/store-school';
import type { StoredFinalsResponse } from '../sync/store-school';
import { tripsGuard } from '../sync/upsert';
import type { GuardedTable } from '../sync/upsert';
import type { BackgroundJob } from './runner';

// Two one-time jobs of 1.0.1 (D61), one student per step, resumable after a stop:
//
// restore-false-removals: before 1.0.1 a re-read of a closed term's weeks, which the diary returns empty, soft-removed
// every record of the term. This clears removed_at on the marks, lessons, absences and remarks that the rules of
// docs/design.md 8 would have kept (dated in a term that had already finished when they went; removed together with
// their lesson; removed in a batch that trips the mass-removal guard) and deletes the false 'removed' mark events. It
// adds no 'restored' event, so nothing reaches the feed or a notification; it logs counts only.
//
// remap-stored-finals: finals were mapped with a guessed period key and dropped. This maps the stored final-marks
// response again (final_marks_raw, else the newest one in raw_responses) with the provider's mapStoredFinals.

type Tx = Parameters<BackgroundJob['step']>[0];
type Cursor = { after: string };

/** The next student after the cursor, in id order; null when there is none */
async function nextStudent(tx: Tx, cursor: Cursor | null) {
  const [row] = await tx
    .select({ id: students.id, providerId: students.providerId })
    .from(students)
    .where(cursor ? gt(students.id, cursor.after) : undefined)
    .orderBy(asc(students.id))
    .limit(1);
  return row ?? null;
}

interface Removed {
  id: string;
  date: ISODate;
  removedAt: Date;
  firstSeenAt: Date;
  lessonId: string | null;
}

interface Siblings {
  /** every row of the table for this student (active and removed), to count what a removal batch left */
  all: Removed[];
}

/**
 * The removed rows the rules would have kept. `frozenAt(day)` is the end of the last term that ended before that local
 * day; `lessonGoneAt` the removal times of lessons, to tell a record that went with its lesson.
 */
export function falselyRemoved(
  table: GuardedTable,
  rows: Siblings,
  ctx: {
    weekOf: (d: ISODate) => ISODate;
    frozenAt: (at: Date) => ISODate | null;
    lessonGoneAt: ReadonlyMap<string, number>;
  },
): string[] {
  const removed = rows.all.filter((r) => r.removedAt.getTime() > 0);
  const out = new Set<string>();
  // a batch: the rows of one week that one upsert removed (the same moment)
  const batches = new Map<string, Removed[]>();
  for (const r of removed) {
    const frozen = ctx.frozenAt(r.removedAt);
    if (frozen && r.date <= frozen) out.add(r.id);
    if (r.lessonId && ctx.lessonGoneAt.get(r.lessonId) === r.removedAt.getTime()) out.add(r.id);
    const key = `${ctx.weekOf(r.date)}|${r.removedAt.getTime()}`;
    batches.set(key, [...(batches.get(key) ?? []), r]);
  }
  for (const [key, batch] of batches) {
    const [week, at] = key.split('|') as [ISODate, string];
    const when = Number(at);
    // what the week held right before: seen by then and not removed earlier
    const stored = rows.all.filter(
      (r) =>
        ctx.weekOf(r.date) === week &&
        r.firstSeenAt.getTime() <= when &&
        (r.removedAt.getTime() === 0 || r.removedAt.getTime() >= when),
    ).length;
    if (tripsGuard({ table, stored, missing: batch.length })) for (const r of batch) out.add(r.id);
  }
  return [...out];
}

const NEVER = new Date(0);

export const restoreFalseRemovals: BackgroundJob<Cursor> = {
  id: 'restore-false-removals-1',
  async step(tx, cursor) {
    const student = await nextStudent(tx, cursor);
    if (!student) return { cursor: null, done: 0 };
    const manifest = getProvider(student.providerId)?.manifest;
    const tz = manifest?.timezone ?? 'UTC';
    const weekOf = (d: ISODate) => weekStartOf(d, manifest?.calendar.weekStart ?? 1);
    const ends = (
      await tx
        .select({ end: terms.endDate })
        .from(terms)
        .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
        .where(eq(schoolYears.studentId, student.id))
    ).map((t) => t.end);
    const frozenAt = (at: Date) => {
      const day = localTime(at, tz).date;
      const ended = ends.filter((e) => e < day).sort();
      return ended.at(-1) ?? null;
    };
    type Row = { id: string; date: ISODate; removedAt: Date | null; firstSeenAt: Date; lessonId: string | null };
    const norm = (rows: Row[]): Removed[] => rows.map((r) => ({ ...r, removedAt: r.removedAt ?? NEVER }));
    const cols = <T extends typeof marks | typeof attendance | typeof behaviourEvents>(t: T) => ({
      id: t.id,
      date: t.date,
      removedAt: t.removedAt,
      firstSeenAt: t.firstSeenAt,
      lessonId: t.lessonId,
    });
    const lessonRows = norm(
      (
        await tx
          .select({
            id: lessons.id,
            date: lessons.date,
            removedAt: lessons.removedAt,
            firstSeenAt: lessons.firstSeenAt,
          })
          .from(lessons)
          .where(eq(lessons.studentId, student.id))
      ).map((l) => ({ ...l, lessonId: null })),
    );
    const markRows = norm(await tx.select(cols(marks)).from(marks).where(eq(marks.studentId, student.id)));
    const attendanceRows = norm(
      await tx.select(cols(attendance)).from(attendance).where(eq(attendance.studentId, student.id)),
    );
    const behaviourRows = norm(
      await tx.select(cols(behaviourEvents)).from(behaviourEvents).where(eq(behaviourEvents.studentId, student.id)),
    );
    const lessonGoneAt = new Map(
      lessonRows.filter((l) => l.removedAt.getTime() > 0).map((l) => [l.id, l.removedAt.getTime()]),
    );
    const ctx = { weekOf, frozenAt, lessonGoneAt };
    const lessonIds = falselyRemoved('lessons', { all: lessonRows }, ctx);
    const markIds = falselyRemoved('marks', { all: markRows }, ctx);
    const attendanceIds = falselyRemoved('attendance', { all: attendanceRows }, ctx);
    const behaviourIds = falselyRemoved('behaviour', { all: behaviourRows }, ctx);

    if (lessonIds.length) await tx.update(lessons).set({ removedAt: null }).where(inArray(lessons.id, lessonIds));
    if (attendanceIds.length)
      await tx.update(attendance).set({ removedAt: null }).where(inArray(attendance.id, attendanceIds));
    if (behaviourIds.length)
      await tx.update(behaviourEvents).set({ removedAt: null }).where(inArray(behaviourEvents.id, behaviourIds));
    let events = 0;
    if (markIds.length) {
      // the false 'removed' events go: the removal never happened in the diary
      const gone = new Map(markRows.map((m) => [m.id, m.removedAt.getTime()]));
      const removedEvents = await tx
        .select({ id: markEvents.id, markId: markEvents.markId, createdAt: markEvents.createdAt })
        .from(markEvents)
        .where(and(inArray(markEvents.markId, markIds), eq(markEvents.kind, 'removed')));
      const falseEvents = removedEvents.filter((e) => gone.get(e.markId) === e.createdAt.getTime()).map((e) => e.id);
      if (falseEvents.length) await tx.delete(markEvents).where(inArray(markEvents.id, falseEvents));
      events = falseEvents.length;
      await tx.update(marks).set({ removedAt: null }).where(inArray(marks.id, markIds));
    }
    const restored = lessonIds.length + markIds.length + attendanceIds.length + behaviourIds.length;
    if (restored) {
      log.info('false removals restored', {
        lessons: lessonIds.length,
        marks: markIds.length,
        attendance: attendanceIds.length,
        behaviour: behaviourIds.length,
        events,
      });
    }
    return { cursor: { after: student.id }, done: 1 };
  },
};

/** The stored finals response of a student's year: final_marks_raw when it holds one, else the newest raw response */
async function storedFinalsResponses(tx: Tx, studentId: string, schoolYearId: string) {
  const out: StoredFinalsResponse[] = [];
  const [kept] = await tx
    .select({ rawJson: finalMarksRaw.rawJson })
    .from(finalMarksRaw)
    .where(and(eq(finalMarksRaw.studentId, studentId), eq(finalMarksRaw.schoolYearId, schoolYearId)));
  const k = kept?.rawJson as Partial<StoredFinalsResponse> | unknown[] | undefined;
  if (k && !Array.isArray(k) && typeof k.endpoint === 'string') out.push({ endpoint: k.endpoint, body: k.body });
  const raw = await tx
    .select({ endpoint: rawResponses.endpoint, body: rawResponses.body })
    .from(rawResponses)
    .where(
      and(
        eq(rawResponses.studentId, studentId),
        isNull(rawResponses.weekStart),
        eq(rawResponses.status, 200),
        isNotNull(rawResponses.body),
      ),
    )
    .orderBy(desc(rawResponses.fetchedAt))
    .limit(200);
  out.push(...raw);
  return out;
}

/** The job with the providers it maps with (tests pass a fictional one) */
export const remapStoredFinalsWith = (
  providerOf: (id: string) => Pick<DiaryProvider, 'mapStoredFinals'> | undefined,
): BackgroundJob<Cursor> => ({
  id: 'remap-stored-finals-1',
  async step(tx, cursor) {
    const student = await nextStudent(tx, cursor);
    if (!student) return { cursor: null, done: 0 };
    const provider = providerOf(student.providerId);
    const next = { cursor: { after: student.id }, done: 1 };
    if (!provider?.mapStoredFinals) return next;
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(eq(schoolYears.studentId, student.id))
      .orderBy(desc(schoolYears.startDate))
      .limit(1);
    if (!year) return next;
    const yearTerms = await tx.select().from(terms).where(eq(terms.schoolYearId, year.id));
    const yearSubjects = await tx
      .select({ id: subjects.id, externalId: subjects.externalId, name: subjects.name })
      .from(subjects)
      .where(and(eq(subjects.studentId, student.id), eq(subjects.schoolYearId, year.id)));
    const known = {
      subjects: yearSubjects.map((s) => ({ externalId: s.externalId, name: s.name })),
      terms: yearTerms.map((t) => ({
        externalId: t.externalId,
        kind: t.kind as never,
        index: t.index,
        label: t.label,
        start: t.startDate,
        end: t.endDate,
      })),
    };
    for (const stored of await storedFinalsResponses(tx, student.id, year.id)) {
      const list = provider.mapStoredFinals(stored, known);
      if (!list) continue;
      if (list.length) {
        await writeFinals(
          tx,
          student.id,
          { schoolYearId: year.id, termIds: new Map(yearTerms.map((t) => [t.externalId, t.id])) },
          new Map(yearSubjects.map((s) => [s.externalId, s.id])),
          list,
          new Date(),
        );
        log.info('stored finals mapped again', { count: list.length });
      }
      break;
    }
    return next;
  },
});

export const remapStoredFinals = remapStoredFinalsWith(getProvider);
