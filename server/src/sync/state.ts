import type { Calendar, ISODate, ProviderManifest } from '@marksy/core';
import { weekStartOf, weekdayOf } from '@marksy/core';
import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  bellSchedules,
  holidays,
  lessons,
  schoolYears,
  syncCoverage,
  termRescans,
  terms,
  weekTemplates,
} from '../db/schema';
import type { FamilySettings } from '../db/schema';
import type { PlanSet } from './collector';
import { hasBacklog, hasPostTerm, isSchoolDay, selectWeeks } from './plan';
import type { CalendarRules, EffectiveLimits, PlanCalendar, StudentPlanState, WeekContext } from './plan';
import { boundWindows, childWindow, unionWindows } from './window';
import type { ChildDay, ChildWindow, Window } from './window';
import { localTime } from './time';

// Reads the planner's state for one student from the database: the school year that contains today (or the last
// one that started), its terms and holidays, verified weeks and finished post-term re-scans.

export async function coverageOf(db: Db, studentId: string): Promise<Map<ISODate, Date>> {
  const rows = await db
    .select({ weekStart: syncCoverage.weekStart, verifiedAt: syncCoverage.verifiedAt })
    .from(syncCoverage)
    .where(and(eq(syncCoverage.studentId, studentId), eq(syncCoverage.status, 'verified')));
  return new Map(rows.map((r) => [r.weekStart, r.verifiedAt]));
}

export async function postTermDoneOf(db: Db, studentId: string): Promise<Set<string>> {
  const rows = await db
    .select({ termId: termRescans.termId })
    .from(termRescans)
    .where(and(eq(termRescans.studentId, studentId), eq(termRescans.postTermRescanDone, true)));
  return new Set(rows.map((r) => r.termId));
}

/** The stored calendar, as the planner sees it; null before the first run stored one */
export async function storedPlanCalendar(db: Db, studentId: string, today: ISODate): Promise<PlanCalendar | null> {
  const [year] = await db
    .select()
    .from(schoolYears)
    .where(and(eq(schoolYears.studentId, studentId), lte(schoolYears.startDate, today)))
    .orderBy(desc(schoolYears.startDate))
    .limit(1);
  if (!year) return null;
  const t = await db.select().from(terms).where(eq(terms.schoolYearId, year.id));
  const h = await db.select().from(holidays).where(eq(holidays.schoolYearId, year.id));
  return {
    year: { from: year.startDate, to: year.endDate },
    terms: t.map((x) => ({ id: x.id, start: x.startDate, end: x.endDate })),
    holidays: h.map((x) => ({ from: x.startDate, to: x.endDate })),
  };
}

/** A fresh calendar from the provider, with the term ids it was stored under */
export function planCalendarOf(calendar: Calendar, termIds: Map<string, string>): PlanCalendar {
  return {
    year: { from: calendar.schoolYear.start, to: calendar.schoolYear.end },
    terms: calendar.terms.map((t) => ({ id: termIds.get(t.externalId)!, start: t.start, end: t.end })),
    holidays: calendar.holidays ?? [],
  };
}

export async function planState(db: Db, studentId: string, calendar: PlanCalendar): Promise<StudentPlanState> {
  return { calendar, coverage: await coverageOf(db, studentId), postTermDone: await postTermDoneOf(db, studentId) };
}

export function weekContext(
  manifest: ProviderManifest,
  family: FamilySettings,
  now: Date,
  lastSuccessAt: Date | null,
): WeekContext {
  const tz = manifest.timezone;
  return {
    weekStart: manifest.calendar.weekStart,
    schoolDays: manifest.calendar.schoolDays,
    noSchoolDates: family.no_school_dates ?? [],
    now,
    today: localTime(now, tz).date,
    localDate: (d) => localTime(d, tz).date,
    lastSuccessAt,
  };
}

/** What window.ts needs to know about one child's date: school or not, its lessons, regular week and bells */
export async function childDayOf(
  db: Db,
  studentId: string,
  date: ISODate,
  cal: PlanCalendar | null,
  rules: CalendarRules,
): Promise<ChildDay> {
  const weekday = weekdayOf(date);
  const schoolDay = cal ? isSchoolDay(date, cal, rules) : rules.schoolDays.includes(weekday);
  const dayLessons = await db
    .select({ slot: lessons.slot, start: lessons.startTime })
    .from(lessons)
    .where(and(eq(lessons.studentId, studentId), eq(lessons.date, date), isNull(lessons.removedAt)));
  const [week] = await db
    .select({ at: syncCoverage.verifiedAt })
    .from(syncCoverage)
    .where(
      and(
        eq(syncCoverage.studentId, studentId),
        eq(syncCoverage.weekStart, weekStartOf(date, rules.weekStart)),
        eq(syncCoverage.status, 'verified'),
      ),
    );
  const [template] = await db
    .select({ entries: weekTemplates.entries })
    .from(weekTemplates)
    .where(eq(weekTemplates.studentId, studentId))
    .orderBy(desc(weekTemplates.fetchedAt))
    .limit(1);
  const bells = await db
    .select({ days: bellSchedules.days, periods: bellSchedules.periods })
    .from(bellSchedules)
    .where(eq(bellSchedules.studentId, studentId));
  return {
    schoolDay,
    fetched: !!week,
    lessons: dayLessons,
    template: (template?.entries ?? [])
      .filter((e) => e.weekday === weekday)
      .map((e) => ({ slot: e.slot, start: e.start ?? null })),
    bells: bells.find((b) => b.days.includes(weekday))?.periods ?? [],
  };
}

export interface ChildToday {
  studentId: string;
  window: ChildWindow;
  /** Weeks waiting per planner set (standing, gap, rescan, post_term, backfill) */
  sets: Partial<Record<PlanSet, number>>;
}

export interface AccountToday {
  children: ChildToday[];
  /** The account's window: the union of its children's, bounded by SYNC_WINDOW */
  windows: Window[];
  /** An unverified week waits: a catch-up may run */
  backlog: boolean;
  postTerm: boolean;
}

/**
 * The planner's view of an account before any login (docs/design.md 10.2, 10.4): today's window of each child it reads,
 * their union, and what is waiting. Shared by run.ts and pnpm sync:plan.
 */
export async function accountToday(
  db: Db,
  studentIds: readonly string[],
  ctx: WeekContext,
  limits: Pick<EffectiveLimits, 'envWindow' | 'standIn'>,
): Promise<AccountToday> {
  const children: ChildToday[] = [];
  let backlog = false;
  let postTerm = false;
  for (const studentId of studentIds) {
    const cal = await storedPlanCalendar(db, studentId, ctx.today);
    const window = childWindow(await childDayOf(db, studentId, ctx.today, cal, ctx), limits.standIn);
    const sets: ChildToday['sets'] = {};
    if (!cal)
      backlog = true; // nothing stored yet: the first run reads everything
    else {
      const weeks = selectWeeks(await planState(db, studentId, cal), ctx);
      for (const w of weeks) sets[w.set] = (sets[w.set] ?? 0) + 1;
      if (hasBacklog(weeks)) backlog = true;
      if (hasPostTerm(weeks)) postTerm = true;
    }
    children.push({ studentId, window, sets });
  }
  const windows = boundWindows(
    unionWindows(children.flatMap((c) => (c.window.window ? [c.window.window] : []))),
    limits.envWindow,
  );
  return { children, windows, backlog, postTerm };
}
