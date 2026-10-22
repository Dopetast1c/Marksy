import type { Calendar, ISODate, ProviderManifest } from '@marksy/core';
import { and, desc, eq, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { holidays, schoolYears, syncCoverage, termRescans, terms } from '../db/schema';
import type { FamilySettings } from '../db/schema';
import type { PlanCalendar, StudentPlanState, WeekContext } from './plan';
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
  inWeeklyWindow: boolean,
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
    inWeeklyWindow,
  };
}
