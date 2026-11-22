import { addDays, calendarRefreshDays, mergeCadences, resolveCadence, schoolRefreshDays } from '@marksy/core';
import type { SyncCadence } from '@marksy/core';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { familyStudents, students, syncReads } from '../db/schema';
import type { PlanCalendar, WeekContext } from './plan';
import { termState } from './plan';
import { AFTER_LAST_MIN } from './window';
import type { Window } from './window';

// How often each child's diary data is read (docs/design.md 10.2, ux-principles D63): the child's settings from every
// family that follows them, and the decisions they drive. No provider code here: `pnpm sync:plan` loads this module.

const DAY_MS = 86_400_000;
/** A run a little early for its slot still counts: the jitter moves runs by up to 20 minutes */
const SLACK_MIN = 15;
/** The days before a term's end from which finals are read every day (SyncCadence.finals = termEnd) */
export const FINALS_DAILY_DAYS = 14;
/** The regular week and the teaching plan are read again this many days after a term started (a late timetable) */
export const TERM_SETTLE_DAYS = 7;

/** The settings a child is read with: the families following the child, the most frequent of their choices */
export async function cadenceOf(db: Db, studentId: string): Promise<SyncCadence> {
  const [student] = await db
    .select({ scale: students.gradingScaleId })
    .from(students)
    .where(eq(students.id, studentId));
  const hasMarks = student?.scale != null;
  const links = await db
    .select({ settings: familyStudents.settings })
    .from(familyStudents)
    .where(and(eq(familyStudents.studentId, studentId), eq(familyStudents.status, 'active')));
  return (
    mergeCadences(links.map((l) => resolveCadence(l.settings.sync, hasMarks))) ?? resolveCadence(undefined, hasMarks)
  );
}

/**
 * When a child's current week is due today, as a window of local minutes inside the child's school-day window: from
 * the next moment the day's rate allows after the last read of the week today (`lastRead`, local minutes) to the end of
 * the window. Null when nothing is due any more today.
 *   hourly: every run (the login interval spaces them); every2h: two hours after the last read; thrice: the window cut
 *   in three, once in each part; afterSchool: once after the last lesson.
 */
export function dueWindow(window: Window | null, rate: SyncCadence['day'], lastRead: number | null): Window | null {
  if (!window) return null;
  const [from, to] = window;
  const after = (gap: number): Window | null => {
    const start = lastRead === null ? from : Math.max(from, lastRead + gap - SLACK_MIN);
    return start < to ? [start, to] : null;
  };
  switch (rate) {
    case 'hourly':
      return after(60);
    case 'every2h':
      return after(120);
    case 'thrice': {
      const part = (to - from) / 3;
      const starts = [from, from + part, from + 2 * part].map(Math.round);
      const next = lastRead === null ? starts[0]! : starts.find((s) => s > lastRead + SLACK_MIN);
      return next !== undefined && next < to ? [next, to] : null;
    }
    case 'afterSchool': {
      // the window ends two hours after the last lesson
      const start = Math.max(from, to - AFTER_LAST_MIN);
      return lastRead !== null && lastRead >= start - SLACK_MIN ? null : [start, to];
    }
  }
}

export interface ReadStamps {
  calendar: Date | null;
  school: Date | null;
}

export async function readStampsOf(db: Db, studentId: string): Promise<ReadStamps> {
  const rows = await db.select().from(syncReads).where(eq(syncReads.studentId, studentId));
  return {
    calendar: rows.find((r) => r.kind === 'calendar')?.readAt ?? null,
    school: rows.find((r) => r.kind === 'school')?.readAt ?? null,
  };
}

export async function stampRead(db: Db, studentId: string, kind: 'calendar' | 'school', at: Date): Promise<void> {
  await db
    .insert(syncReads)
    .values({ studentId, kind, readAt: at })
    .onConflictDoUpdate({ target: [syncReads.studentId, syncReads.kind], set: { readAt: at } });
}

/** Something showed that a kind changed (an unknown subject, a school week without lessons): the next run reads it */
export async function forgetRead(db: Db, studentId: string, kind: 'calendar' | 'school'): Promise<void> {
  await db.delete(syncReads).where(and(eq(syncReads.studentId, studentId), eq(syncReads.kind, kind)));
}

const olderThan = (at: Date, days: number | null, now: Date) =>
  days !== null && now.getTime() - at.getTime() >= days * DAY_MS;

type DueContext = Pick<WeekContext, 'now' | 'today' | 'localDate'>;

/**
 * The calendar (year, terms, holidays, the class): never read, older than the child's setting, or today outside the
 * stored school year (a new year has begun)
 */
export function calendarDue(at: Date | null, cadence: SyncCadence, cal: PlanCalendar | null, ctx: DueContext): boolean {
  if (!at || !cal) return true;
  if (ctx.today > cal.year.to) return true;
  return olderThan(at, calendarRefreshDays(cadence.calendar), ctx.now);
}

/**
 * The school's reference data (subjects, bells, the regular week, rooms, teachers): never read, older than the child's
 * setting, not read since the current term started, or not since a week into it (a timetable entered late)
 */
export function schoolDue(at: Date | null, cadence: SyncCadence, cal: PlanCalendar | null, ctx: DueContext): boolean {
  if (!at) return true;
  if (olderThan(at, schoolRefreshDays(cadence.school), ctx.now)) return true;
  const read = ctx.localDate(at);
  const term = cal?.terms.find((t) => t.start <= ctx.today && t.end >= ctx.today);
  if (!term) return false;
  if (read < term.start) return true;
  const settled = addDays(term.start, TERM_SETTLE_DAYS);
  return ctx.today >= settled && read < settled;
}

/**
 * Final marks: never with `off`; otherwise once a day from FINALS_DAILY_DAYS before a term ends until it closes (D61),
 * and once a week the rest of the year (with `weekly`, always once a week)
 */
export function finalsDue(
  last: Date | null,
  cadence: SyncCadence,
  cal: PlanCalendar | null,
  finalsIn: ReadonlySet<string>,
  ctx: DueContext,
): boolean {
  if (cadence.finals === 'off') return false;
  if (!last) return true;
  const today = ctx.localDate(last) === ctx.today;
  if (cadence.finals === 'termEnd' && cal) {
    const busy = cal.terms.some((t) => {
      const s = termState(t, ctx.today, finalsIn);
      return s === 'waiting' || (s === 'current' && addDays(t.end, -FINALS_DAILY_DAYS) <= ctx.today);
    });
    if (busy) return !today;
  }
  return olderThan(last, 7, ctx.now);
}

/** The local date of `at` is today: a read of the day happened already */
export const readToday = (at: Date | null | undefined, ctx: Pick<WeekContext, 'today' | 'localDate'>): boolean =>
  !!at && ctx.localDate(at) === ctx.today;
