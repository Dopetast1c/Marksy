import { addDays, daysBetween, minDate, weekStartOf, weekdayOf } from '@marksy/core';
import type { DateRange, ISODate } from '@marksy/core';
import type { PlanSet, WeekRequest } from './collector';
import { localTime, parseWindow } from './time';
import type { LocalTime } from './time';

// The planner of docs/design.md 10.4, as pure functions over recorded state: may a run start now, and which weeks
// should it fetch. No clock, no database: run.ts gathers the state, the tests feed it directly. A machine that was off
// for a week looks exactly like this to the planner: an old last success and weeks that were never verified.

const DAY_MS = 86_400_000;
/** A week of the current term verified longer ago than this is fetched again inside the school day (re-scan) */
export const RESCAN_AGE_DAYS = 6;
/**
 * A finished term closes this many days after its end, or earlier once every subject with marks in it has its final
 * (D61). Until then its last weeks keep the stale-week re-check; once closed, no automatic read fetches its weeks.
 */
export const TERM_CLOSE_DAYS = 7;
/** The last weeks of a finished term that the re-check reads until the term closes: the term's last two weeks */
export const LAST_WEEKS_DAYS = 14;
/** How far the next school week is looked for past holidays */
export const AHEAD_WEEKS = 3;

export interface PlanTerm {
  id: string;
  start: ISODate;
  end: ISODate;
}

export interface PlanCalendar {
  year: DateRange;
  terms: PlanTerm[];
  holidays: DateRange[];
}

/** upcoming, current, finished and waiting for finals (until closesOn), closed (D61) */
export type TermState = 'upcoming' | 'current' | 'waiting' | 'closed';

/** The day a finished term closes at the latest */
export const closesOn = (t: PlanTerm): ISODate => addDays(t.end, TERM_CLOSE_DAYS);

export function termState(t: PlanTerm, today: ISODate, finalsIn: ReadonlySet<string>): TermState {
  if (t.start > today) return 'upcoming';
  if (t.end >= today) return 'current';
  return closesOn(t) <= today || finalsIn.has(t.id) ? 'closed' : 'waiting';
}

export interface CalendarRules {
  weekStart: number;
  schoolDays: readonly number[];
  /** The family's extra days without school */
  noSchoolDates: readonly string[];
}

export interface StudentPlanState {
  calendar: PlanCalendar;
  /** week_start -> verified_at, verified weeks only */
  coverage: ReadonlyMap<ISODate, Date>;
  /** The finished terms where every subject with marks has its final: closed before TERM_CLOSE_DAYS (D61) */
  finalsIn: ReadonlySet<string>;
  /** Weeks the mass-removal guard held today (local date): not asked for again before tomorrow (design.md 8) */
  heldToday?: ReadonlySet<ISODate>;
}

export interface WeekContext extends CalendarRules {
  now: Date;
  /** The school's local date */
  today: ISODate;
  /** Local date of a moment, in the school's time zone */
  localDate(at: Date): ISODate;
  lastSuccessAt: Date | null;
  /** The provider shows lessons ahead (capabilities.futureTimetable): the next school week is a standing week too */
  readsAhead?: boolean;
}

/** Is d a school day: a school weekday of the manifest, inside the year, not a holiday, not a family day off? */
export function isSchoolDay(d: ISODate, cal: PlanCalendar, rules: CalendarRules): boolean {
  if (d < cal.year.from || d > cal.year.to) return false;
  if (!rules.schoolDays.includes(weekdayOf(d))) return false;
  if (rules.noSchoolDates.includes(d)) return false;
  return !cal.holidays.some((h) => d >= h.from && d <= h.to);
}

function isSchoolWeek(w: ISODate, cal: PlanCalendar, rules: CalendarRules): boolean {
  for (let i = 0; i < 7; i++) if (isSchoolDay(addDays(w, i), cal, rules)) return true;
  return false;
}

/**
 * The week of the child's first school day after the current week: holiday weeks are skipped, at most AHEAD_WEEKS
 * ahead, never past the school year (30 October with the holidays of 2 to 8 November: the week of 9 November)
 */
export function nextSchoolWeek(cal: PlanCalendar, ctx: WeekContext): ISODate | null {
  const current = weekStartOf(ctx.today, ctx.weekStart);
  for (let k = 1; k <= AHEAD_WEEKS; k++) {
    const w = addDays(current, 7 * k);
    if (w > cal.year.to) return null;
    if (isSchoolWeek(w, cal, ctx)) return w;
  }
  return null;
}

/**
 * On a day without school for the child (weekend, holidays): the week of their nearest school day, when it was not
 * read on their last school day or since (the Friday runs failed: machine off, diary down). That allows one run in the
 * manifest's window during the stretch without school (D55); null when nothing is waiting.
 */
export function aheadDue(
  state: StudentPlanState,
  ctx: WeekContext,
): { week: ISODate; lastSchoolDay: ISODate | null; since: ISODate } | null {
  const cal = state.calendar;
  if (!ctx.readsAhead || isSchoolDay(ctx.today, cal, ctx)) return null;
  const until = addDays(weekStartOf(ctx.today, ctx.weekStart), 7 * (AHEAD_WEEKS + 1) - 1);
  let next: ISODate | null = null;
  for (let d = addDays(ctx.today, 1); d <= until && d <= cal.year.to; d = addDays(d, 1))
    if (isSchoolDay(d, cal, ctx)) {
      next = d;
      break;
    }
  if (!next) return null;
  let last: ISODate | null = null;
  for (
    let d = addDays(ctx.today, -1);
    d >= cal.year.from && daysBetween(d, ctx.today) <= 7 * (AHEAD_WEEKS + 1);
    d = addDays(d, -1)
  )
    if (isSchoolDay(d, cal, ctx)) {
      last = d;
      break;
    }
  const week = weekStartOf(next, ctx.weekStart);
  const at = state.coverage.get(week);
  if (at && (!last || ctx.localDate(at) >= last)) return null;
  // the stretch without school began after the last school day; with none in sight (late August), at the horizon
  return { week, lastSchoolDay: last, since: last ?? addDays(ctx.today, -7 * (AHEAD_WEEKS + 1)) };
}

/** School weeks of the year up to today, newest first */
function weeksSoFar(cal: PlanCalendar, ctx: WeekContext): ISODate[] {
  const last = minDate(ctx.today, cal.year.to);
  if (last < cal.year.from) return [];
  const out: ISODate[] = [];
  for (let w = weekStartOf(last, ctx.weekStart); daysBetween(w, cal.year.from) <= 6; w = addDays(w, -7)) {
    if (isSchoolWeek(w, cal, ctx)) out.push(w);
  }
  return out;
}

const ageDays = (verified: Date, now: Date) => (now.getTime() - verified.getTime()) / DAY_MS;

const overlaps = (w: ISODate, t: PlanTerm) => addDays(w, 6) >= t.start && w <= t.end;

/** A week only closed terms touch: no automatic read fetches it again once it was verified (D61) */
function inClosedTerm(w: ISODate, state: StudentPlanState, today: ISODate): boolean {
  const touching = state.calendar.terms.filter((t) => overlaps(w, t));
  return touching.length > 0 && touching.every((t) => termState(t, today, state.finalsIn) === 'closed');
}

/**
 * The stale-week re-check: weeks verified longer ago than the re-scan age, of the current term and of the last weeks
 * of a finished term that has not closed yet (late marks come in its last days). A closed term has none.
 */
function staleTermWeeks(state: StudentPlanState, weeks: ISODate[], ctx: WeekContext): ISODate[] {
  const due = (w: ISODate) => {
    const at = state.coverage.get(w);
    // never verified: that is backfill
    return !!at && ageDays(at, ctx.now) > RESCAN_AGE_DAYS;
  };
  return weeks.filter(
    (w) =>
      state.calendar.terms.some((t) => {
        if (!overlaps(w, t)) return false;
        const s = termState(t, ctx.today, state.finalsIn);
        return s === 'current' || (s === 'waiting' && w >= addDays(t.end, 1 - LAST_WEEKS_DAYS));
      }) && due(w),
  );
}

/**
 * The weeks of one student in fetch order: standing (the current week, the next school week where the diary shows
 * lessons ahead, and the previous one), the gap since the last success (newest first), the re-scan of stale weeks
 * (the current term, the last weeks of a finished term until it closes), then the backfill of never-verified weeks.
 * The re-scan has no slot of its own: it fills the school-day runs (design.md 10.2, D55). A verified week of a closed
 * term is in no set (D61), and a week the mass-removal guard held today waits for tomorrow (design.md 8).
 */
export function selectWeeks(state: StudentPlanState, ctx: WeekContext): WeekRequest[] {
  const cal = state.calendar;
  const weeks = weeksSoFar(cal, ctx);
  const current = weekStartOf(ctx.today, ctx.weekStart);
  const out: WeekRequest[] = [];
  const taken = new Set<ISODate>(state.heldToday ?? []);
  const add = (w: ISODate, set: PlanSet) => {
    if (taken.has(w)) return;
    // a closed term's weeks are read once if they never were (backfill), never again
    if (set !== 'backfill' && state.coverage.has(w) && inClosedTerm(w, state, ctx.today)) return;
    taken.add(w);
    out.push({ weekStart: w, set });
  };

  // every run reads the next school week too: teachers set Monday's homework on Friday, and no run reads at the
  // weekend or in the holidays but the one of aheadDue (D55)
  const next = ctx.readsAhead ? nextSchoolWeek(cal, ctx) : null;
  if (weeks.includes(current)) add(current, 'standing');
  if (next) add(next, 'standing');
  if (weeks.includes(addDays(current, -7))) add(addDays(current, -7), 'standing');

  // a week is caught up once it was fetched after it ended
  if (ctx.lastSuccessAt) {
    const from = addDays(weekStartOf(ctx.localDate(ctx.lastSuccessAt), ctx.weekStart), -7);
    for (const w of weeks) {
      if (w < from) break;
      const at = state.coverage.get(w);
      if (!at || ctx.localDate(at) <= addDays(w, 6)) add(w, 'gap');
    }
  }

  for (const w of staleTermWeeks(state, weeks, ctx)) add(w, 'rescan');

  for (const w of weeks) if (!state.coverage.has(w)) add(w, 'backfill');
  return out;
}

/** After a run: whether the current term has no stale week left (term_rescans.last_full_rescan_at) */
export function termBookkeeping(
  state: StudentPlanState,
  ctx: WeekContext,
): { currentTermId: string | null; currentFresh: boolean } {
  const weeks = weeksSoFar(state.calendar, ctx);
  const current = [...state.calendar.terms].filter((t) => t.start <= ctx.today && t.end >= ctx.today)[0];
  const stale = current ? staleTermWeeks(state, weeks, ctx).filter((w) => overlaps(w, current)) : [];
  return { currentTermId: current?.id ?? null, currentFresh: !!current && stale.length === 0 };
}

/** The school weeks of a term up to today (a manual re-check of a finished term reads these, D61) */
export function termWeeks(cal: PlanCalendar, term: PlanTerm, ctx: WeekContext): ISODate[] {
  return weeksSoFar(cal, ctx).filter((w) => overlaps(w, term));
}

/**
 * A week never fetched after it ended (gap, backfill): that allows a catch-up outside the school day. Stale weeks of
 * the re-scan do not: they are verified already and wait for the next school day (D55).
 */
export const hasBacklog = (requests: readonly WeekRequest[]) =>
  requests.some((r) => r.set === 'gap' || r.set === 'backfill');

/** A finished term of the student still waits for its finals (it has not closed, D61) */
export const waitsForFinals = (state: StudentPlanState, today: ISODate) =>
  state.calendar.terms.some((t) => termState(t, today, state.finalsIn) === 'waiting');

// ---------------------------------------------------------------------------------------------------------------
// May a run start now?

/** cli: pnpm sync:once by the owner; cli-claude: the same started by Claude Code (CLAUDE.md, Real diary runs) */
export type Trigger = 'schedule' | 'startup' | 'cli' | 'cli-claude' | `user:${string}`;
export const isManual = (t: Trigger) => t === 'cli' || t === 'cli-claude' || t.startsWith('user:');

export interface AccountState {
  pausedUntil: Date | null;
  lastAttemptAt: Date | null;
  /** A real login outside the planner (pnpm probe) stamps only this; it counts for the interval too */
  lastLoginAt?: Date | null;
  lastSuccessAt: Date | null;
  requiresAction: string | null;
}

export interface EffectiveLimits {
  /** SYNC_WINDOW: an outer bound on every child's window, in local minutes (the whole day when unset) */
  envWindow: [number, number] | null;
  /** The manifest's syncWindow narrowed by SYNC_WINDOW: the stand-in when a day's times are unknown */
  standIn: [number, number] | null;
  minLoginIntervalMinutes: number;
  maxRequestsPerRun: number;
  jitterMinutes: number;
  catchupAfterMs: number;
  offlineRetryMinutes: number;
}

export interface GateInput {
  now: Date;
  local: LocalTime;
  /** The school's time zone (manifest) */
  timeZone: string;
  trigger: Trigger;
  account: AccountState;
  limits: EffectiveLimits;
  /**
   * Today's school-day windows of the children the account reads, in local minutes, already narrowed by SYNC_WINDOW
   * (window.ts). Empty on a day without school for all of them.
   */
  windows: readonly [number, number][];
  /** Today is a school weekday of the manifest (for the finals run during holidays) */
  weekday: boolean;
  /** A week never fetched after it ended waits (gap, backfill): a catch-up may run at any hour */
  backlog: boolean;
  /** A finished term waits for its finals (it has not closed, D61) */
  waitingFinals: boolean;
  /**
   * A child's nearest school week was not read since their last school day, and no run of kind ahead has started in
   * this stretch without school (aheadDue, state.ts)
   */
  ahead?: boolean;
  /** Some child has school today by the calendar; on a day without school a long gap since the last read is normal */
  schoolDay?: boolean;
  /** The last run that ended skipped_offline */
  lastOfflineAt: Date | null;
  /** Seeds the run's jitter: the account id */
  seed: string;
}

export type GateDecision =
  | { start: true; kind: 'scheduled' | 'catchup' | 'ahead' | 'rescan' | 'manual' | 'backfill' }
  | {
      start: false;
      reason:
        'requires_action' | 'paused' | 'interval' | 'offline_retry' | 'jitter' | 'outside_window' | 'checked_today';
      /** Manual triggers leave a skipped row so the user sees why; scheduled ticks leave nothing */
      record: 'skipped_paused' | 'skipped_interval' | null;
      /** When the login budget allows the next attempt */
      retryAt?: Date;
    };

/** Intersection of "HH:MM-HH:MM" windows: each source can only narrow it (design 10.2) */
export function narrowWindow(...windows: (string | undefined | null)[]): [number, number] | null {
  let from = 0;
  let to = 24 * 60;
  for (const w of windows) {
    if (!w) continue;
    const [a, b] = parseWindow(w);
    from = Math.max(from, a);
    to = Math.min(to, b);
  }
  return from < to ? [from, to] : null;
}

/** A stable pseudo-random number of minutes in [0, max): the same boundary always gets the same delay */
export function jitterMinutes(seed: string, max: number): number {
  if (max <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return (h >>> 0) % max;
}

export function decideStart(input: GateInput): GateDecision {
  const { now, local, account, limits } = input;
  const manual = isManual(input.trigger);
  if (account.requiresAction) return { start: false, reason: 'requires_action', record: null };

  // an attempt counts even if it failed: the diary saw a login, and so does a probe's login (last_login_at). A clock
  // that went backwards counts as elapsed.
  const lastLogin = [account.lastAttemptAt, account.lastLoginAt]
    .filter((d): d is Date => !!d && d <= now)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const nextLogin = lastLogin && new Date(lastLogin.getTime() + limits.minLoginIntervalMinutes * 60_000);
  if (nextLogin && now < nextLogin) {
    return { start: false, reason: 'interval', record: manual ? 'skipped_interval' : null, retryAt: nextLogin };
  }
  // a person pressing the button is the best sign the diary is back: one attempt, even during a pause
  if (manual) return { start: true, kind: 'manual' };
  if (account.pausedUntil && now < account.pausedUntil) {
    return { start: false, reason: 'paused', record: null, retryAt: account.pausedUntil };
  }
  if (input.lastOfflineAt && now.getTime() - input.lastOfflineAt.getTime() < limits.offlineRetryMinutes * 60_000) {
    return { start: false, reason: 'offline_retry', record: null };
  }

  if (!account.lastSuccessAt) return { start: true, kind: 'backfill' };

  // the run starts a random 0..jitter minutes after the moment it became possible, never at an exact minute
  const afterJitter = (window: readonly [number, number]) => {
    let boundary = window[0];
    if (nextLogin) {
      const next = localTime(nextLogin, input.timeZone);
      if (next.date === local.date) boundary = Math.max(boundary, next.minutes);
    }
    const delay = jitterMinutes(`${input.seed}|${local.date}|${boundary}`, limits.jitterMinutes);
    return local.minutes >= boundary + delay;
  };
  const inside = (w: readonly [number, number] | null) => !!w && local.minutes >= w[0] && local.minutes < w[1];

  // during a child's school day: hourly, the stale term weeks included
  const now_ = input.windows.find(inside);
  if (now_)
    return afterJitter(now_) ? { start: true, kind: 'scheduled' } : { start: false, reason: 'jitter', record: null };

  // a day without school for every child (weekend, holidays): one run in the manifest's window when a child's nearest
  // school week was not read since their last school day (Friday failed), once per stretch without school (D55)
  if (input.ahead && input.schoolDay === false && inside(limits.standIn)) {
    return afterJitter(limits.standIn!)
      ? { start: true, kind: 'ahead' }
      : { start: false, reason: 'jitter', record: null };
  }

  // a finished term waiting for its finals in the holidays (no child has a window): one run a weekday in the manifest's
  // window, or the finals (the year's above all) would wait for the next term; it reads the finals and the term's last
  // weeks, nothing more (D61)
  const ranToday = localTime(account.lastSuccessAt, input.timeZone).date === local.date;
  if (input.waitingFinals && !ranToday && input.windows.length === 0 && input.weekday && inside(limits.standIn)) {
    return afterJitter(limits.standIn!)
      ? { start: true, kind: 'rescan' }
      : { start: false, reason: 'jitter', record: null };
  }

  // outside the window only a catch-up: the data it fetches already exists. A day without school for every child does
  // not make the last read stale (nothing new appears in the diary then, D55): there only a real backlog may run
  const stale = input.schoolDay !== false && now.getTime() - account.lastSuccessAt.getTime() > limits.catchupAfterMs;
  if (stale || input.backlog) return { start: true, kind: 'catchup' };
  return { start: false, reason: 'outside_window', record: null };
}
