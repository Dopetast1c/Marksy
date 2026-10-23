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
/** Finished terms are fetched once more this long after their end (late finals and edits) */
export const POST_TERM_DAYS = 14;

export interface PlanCalendar {
  year: DateRange;
  terms: { id: string; start: ISODate; end: ISODate }[];
  holidays: DateRange[];
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
  /** term id -> the post-term re-scan is done */
  postTermDone: ReadonlySet<string>;
}

export interface WeekContext extends CalendarRules {
  now: Date;
  /** The school's local date */
  today: ISODate;
  /** Local date of a moment, in the school's time zone */
  localDate(at: Date): ISODate;
  lastSuccessAt: Date | null;
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

/** Weeks of the current term (or the last one that started) verified longer ago than the re-scan age */
function staleTermWeeks(state: StudentPlanState, weeks: ISODate[], ctx: WeekContext): ISODate[] {
  const term = [...state.calendar.terms]
    .filter((t) => t.start <= ctx.today)
    .sort((a, b) => b.start.localeCompare(a.start))[0];
  if (!term) return [];
  const inTerm = weeks.filter((w) => addDays(w, 6) >= term.start && w <= term.end);
  return inTerm.filter((w) => {
    const at = state.coverage.get(w);
    // never verified: that is backfill
    return !!at && ageDays(at, ctx.now) > RESCAN_AGE_DAYS;
  });
}

/** Weeks of terms that ended two weeks ago and were not fetched since */
function postTermWeeks(state: StudentPlanState, weeks: ISODate[], ctx: WeekContext): ISODate[] {
  const out: ISODate[] = [];
  for (const t of state.calendar.terms) {
    const due = addDays(t.end, POST_TERM_DAYS);
    if (due > ctx.today || state.postTermDone.has(t.id)) continue;
    for (const w of weeks) {
      if (addDays(w, 6) < t.start || w > t.end) continue;
      const at = state.coverage.get(w);
      if (at && ctx.localDate(at) < due) out.push(w);
    }
  }
  return out;
}

/**
 * The weeks of one student in fetch order: standing (current and previous week), the gap since the last success
 * (newest first), the re-scan of the current term's stale weeks, the once-more of finished terms, then the backfill of
 * never-verified weeks. The re-scan has no slot of its own: it fills the school-day runs (design.md 10.2, D55).
 */
export function selectWeeks(state: StudentPlanState, ctx: WeekContext): WeekRequest[] {
  const cal = state.calendar;
  const weeks = weeksSoFar(cal, ctx);
  const current = weekStartOf(ctx.today, ctx.weekStart);
  const out: WeekRequest[] = [];
  const taken = new Set<ISODate>();
  const add = (w: ISODate, set: PlanSet) => {
    if (taken.has(w)) return;
    taken.add(w);
    out.push({ weekStart: w, set });
  };

  for (const w of weeks) if (w === current || w === addDays(current, -7)) add(w, 'standing');

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
  for (const w of postTermWeeks(state, weeks, ctx)) add(w, 'post_term');

  for (const w of weeks) if (!state.coverage.has(w)) add(w, 'backfill');
  return out;
}

/**
 * After a run: the finished terms whose post-term re-scan is now complete, and whether the current term has no stale
 * week left (term_rescans.last_full_rescan_at).
 */
export function termBookkeeping(
  state: StudentPlanState,
  ctx: WeekContext,
): { postTermDone: string[]; currentTermId: string | null; currentFresh: boolean } {
  const weeks = weeksSoFar(state.calendar, ctx);
  const postTermDone = state.calendar.terms
    .filter((t) => addDays(t.end, POST_TERM_DAYS) <= ctx.today && !state.postTermDone.has(t.id))
    .filter((t) => postTermWeeks({ ...state, calendar: { ...state.calendar, terms: [t] } }, weeks, ctx).length === 0)
    .map((t) => t.id);
  const current = [...state.calendar.terms].filter((t) => t.start <= ctx.today && t.end >= ctx.today)[0];
  return {
    postTermDone,
    currentTermId: current?.id ?? null,
    currentFresh: current ? staleTermWeeks(state, weeks, ctx).length === 0 : false,
  };
}

/**
 * A week never fetched after it ended (gap, backfill): that allows a catch-up outside the school day. Stale weeks of
 * the re-scan do not: they are verified already and wait for the next school day (D55).
 */
export const hasBacklog = (requests: readonly WeekRequest[]) =>
  requests.some((r) => r.set === 'gap' || r.set === 'backfill');

/** A finished term is due for its once-more (POST_TERM_DAYS after its end) */
export const hasPostTerm = (requests: readonly WeekRequest[]) => requests.some((r) => r.set === 'post_term');

// ---------------------------------------------------------------------------------------------------------------
// May a run start now?

/** cli: pnpm sync:once by the owner; cli-claude: the same started by Claude Code (CLAUDE.md, Real diary runs) */
export type Trigger = 'schedule' | 'startup' | 'cli' | 'cli-claude' | `user:${string}`;
export const isManual = (t: Trigger) => t === 'cli' || t === 'cli-claude' || t.startsWith('user:');

export interface AccountState {
  pausedUntil: Date | null;
  lastAttemptAt: Date | null;
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
  /** Today is a school weekday of the manifest (for the post-term run during holidays) */
  weekday: boolean;
  /** A week never fetched after it ended waits (gap, backfill): a catch-up may run at any hour */
  backlog: boolean;
  /** A finished term's once-more is due */
  postTerm: boolean;
  /** The last run that ended skipped_offline */
  lastOfflineAt: Date | null;
  /** Seeds the run's jitter: the account id */
  seed: string;
}

export type GateDecision =
  | { start: true; kind: 'scheduled' | 'catchup' | 'rescan' | 'manual' | 'backfill' }
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

  // an attempt counts even if it failed: the diary saw a login. A clock that went backwards counts as elapsed.
  const nextLogin =
    account.lastAttemptAt && new Date(account.lastAttemptAt.getTime() + limits.minLoginIntervalMinutes * 60_000);
  if (nextLogin && now >= account.lastAttemptAt! && now < nextLogin) {
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

  // a finished term's once-more that falls into the holidays (no child has a window): one run in the manifest's window
  // on a weekday, or the year's finals would wait for September
  if (input.postTerm && input.windows.length === 0 && input.weekday && inside(limits.standIn)) {
    return afterJitter(limits.standIn!)
      ? { start: true, kind: 'rescan' }
      : { start: false, reason: 'jitter', record: null };
  }

  // outside the window only a catch-up: the data it fetches already exists
  const stale = now.getTime() - account.lastSuccessAt.getTime() > limits.catchupAfterMs;
  if (stale || input.backlog) return { start: true, kind: 'catchup' };
  return { start: false, reason: 'outside_window', record: null };
}
