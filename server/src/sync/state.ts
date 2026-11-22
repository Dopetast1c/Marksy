import type { Calendar, ISODate, ProviderManifest } from '@marksy/core';
import { addDays, weekStartOf, weekdayOf } from '@marksy/core';
import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  bellSchedules,
  finalMarks,
  holidays,
  lessons,
  marks,
  schoolYears,
  syncCoverage,
  syncRuns,
  terms,
  weekTemplates,
} from '../db/schema';
import type { FamilySettings } from '../db/schema';
import type { PlanSet } from './collector';
import { aheadDue, hasBacklog, isSchoolDay, selectWeeks, waitsForFinals } from './plan';
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

/**
 * The terms of the calendar where every subject that has marks in the term has its final (any source): such a term
 * closes before TERM_CLOSE_DAYS (D61). A term without marks never closes early.
 */
export async function finalsInOf(db: Db, studentId: string, cal: PlanCalendar): Promise<Set<string>> {
  const out = new Set<string>();
  if (!cal.terms.length) return out;
  const finals = await db
    .select({ periodId: finalMarks.periodId, subjectId: finalMarks.subjectId })
    .from(finalMarks)
    .where(
      and(
        eq(finalMarks.studentId, studentId),
        inArray(
          finalMarks.periodId,
          cal.terms.map((t) => t.id),
        ),
      ),
    );
  if (!finals.length) return out;
  for (const t of cal.terms) {
    const withFinal = new Set(finals.filter((f) => f.periodId === t.id).map((f) => f.subjectId));
    if (!withFinal.size) continue;
    const marked = await db
      .selectDistinct({ subjectId: marks.subjectId })
      .from(marks)
      .where(
        and(eq(marks.studentId, studentId), gte(marks.date, t.start), lte(marks.date, t.end), isNull(marks.removedAt)),
      );
    if (marked.length && marked.every((m) => withFinal.has(m.subjectId))) out.add(t.id);
  }
  return out;
}

/** The weeks the mass-removal guard held on the school's local today (design.md 8) */
export async function heldToday(
  db: Db,
  studentId: string,
  ctx: Pick<WeekContext, 'today' | 'localDate'>,
): Promise<Set<ISODate>> {
  const rows = await db
    .select({ weekStart: syncCoverage.weekStart, heldAt: syncCoverage.heldAt })
    .from(syncCoverage)
    .where(and(eq(syncCoverage.studentId, studentId), isNotNull(syncCoverage.heldAt)));
  return new Set(rows.filter((r) => ctx.localDate(r.heldAt!) === ctx.today).map((r) => r.weekStart));
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

/** `ctx`: today in the school's time zone, to leave out the weeks the guard held today */
export async function planState(
  db: Db,
  studentId: string,
  calendar: PlanCalendar,
  ctx?: Pick<WeekContext, 'today' | 'localDate'>,
): Promise<StudentPlanState> {
  return {
    calendar,
    coverage: await coverageOf(db, studentId),
    finalsIn: await finalsInOf(db, studentId, calendar),
    ...(ctx && { heldToday: await heldToday(db, studentId, ctx) }),
  };
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
    readsAhead: manifest.capabilities.futureTimetable,
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
  /** A finished term of a child waits for its finals (D61) */
  waitingFinals: boolean;
  /** A day without school: a child's nearest school week waits and this stretch has had no run of kind ahead yet */
  ahead: boolean;
  /** Some child has school today by their calendar (a weekday of the manifest, not a holiday or a family day off) */
  schoolDay: boolean;
}

/** The start of the account's last run of kind ahead that reached the diary (an offline attempt is not one) */
export async function lastAheadOf(db: Db, accountId: string): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .where(
      and(eq(syncRuns.diaryAccountId, accountId), eq(syncRuns.kind, 'ahead'), ne(syncRuns.status, 'skipped_offline')),
    )
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  return row?.startedAt ?? null;
}

/**
 * The planner's view of an account before any login (docs/design.md 10.2, 10.4): today's window of each child it reads,
 * their union, and what is waiting. Shared by run.ts and pnpm sync:plan.
 */
export interface NextSchoolDay {
  date: ISODate;
  /** When that day's window opens, minutes of the school's day; null when the day's times are not known */
  from: number | null;
  /** Holidays lie between today and that day: "next after the holidays" (more.sync.nextAfterHolidays) */
  afterHolidays: boolean;
}

/** How far ahead the next school day is looked for: the summer is not a stretch to plan across */
const NEXT_DAY_HORIZON = 60;

/**
 * The account's next school day after today (Sync, sync.title, design.md 5.6): the earliest of its children's, with that
 * day's window as the planner will compute it (the child's lessons and bells, or the manifest's window when the day's
 * times are unknown). Null when no child has one within the horizon or in the stored school year.
 */
export async function nextSchoolDayOf(
  db: Db,
  studentIds: readonly string[],
  ctx: WeekContext,
  limits: Pick<EffectiveLimits, 'envWindow' | 'standIn'>,
): Promise<NextSchoolDay | null> {
  let best: NextSchoolDay | null = null;
  for (const studentId of studentIds) {
    const cal = await storedPlanCalendar(db, studentId, ctx.today);
    if (!cal) continue;
    for (let i = 1; i <= NEXT_DAY_HORIZON; i++) {
      const date = addDays(ctx.today, i);
      if (best && date > best.date) break;
      if (!isSchoolDay(date, cal, ctx)) continue;
      const window = childWindow(await childDayOf(db, studentId, date, cal, ctx), limits.standIn).window;
      const from = window ? (boundWindows([window], limits.envWindow)[0]?.[0] ?? null) : null;
      const afterHolidays = cal.holidays.some((h) => h.to >= ctx.today && h.from < date);
      if (!best || date < best.date) best = { date, from, afterHolidays };
      else if (from != null && (best.from == null || from < best.from))
        best = { date: best.date, from, afterHolidays: best.afterHolidays };
      break;
    }
  }
  return best;
}

export async function accountToday(
  db: Db,
  studentIds: readonly string[],
  ctx: WeekContext,
  limits: Pick<EffectiveLimits, 'envWindow' | 'standIn'>,
  /** The last run of kind ahead of the account that reached the diary (offline attempts do not count) */
  lastAheadAt: Date | null = null,
): Promise<AccountToday> {
  const children: ChildToday[] = [];
  let backlog = false;
  let waitingFinals = false;
  let ahead = false;
  const aheadOn = lastAheadAt ? ctx.localDate(lastAheadAt) : null;
  for (const studentId of studentIds) {
    const cal = await storedPlanCalendar(db, studentId, ctx.today);
    const window = childWindow(await childDayOf(db, studentId, ctx.today, cal, ctx), limits.standIn);
    const sets: ChildToday['sets'] = {};
    if (!cal)
      backlog = true; // nothing stored yet: the first run reads everything
    else {
      const state = await planState(db, studentId, cal, ctx);
      const weeks = selectWeeks(state, ctx);
      for (const w of weeks) sets[w.set] = (sets[w.set] ?? 0) + 1;
      if (hasBacklog(weeks)) backlog = true;
      if (waitsForFinals(state, ctx.today)) waitingFinals = true;
      // one run per stretch without school: none since the child's last school day
      const due = aheadDue(state, ctx);
      if (due && !(aheadOn && aheadOn > due.since)) ahead = true;
    }
    children.push({ studentId, window, sets });
  }
  const windows = boundWindows(
    unionWindows(children.flatMap((c) => (c.window.window ? [c.window.window] : []))),
    limits.envWindow,
  );
  // no child stored yet (just connected): count it as a school day, the backlog runs anyway
  const schoolDay = children.length === 0 || children.some((c) => c.window.source !== 'no_school');
  return { children, windows, backlog, waitingFinals, ahead, schoolDay };
}
