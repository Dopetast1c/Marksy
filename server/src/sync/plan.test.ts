import { describe, expect, it } from 'vitest';
import {
  aheadDue,
  decideStart,
  hasBacklog,
  hasPostTerm,
  jitterMinutes,
  narrowWindow,
  nextSchoolWeek,
  selectWeeks,
} from './plan';
import type { EffectiveLimits, GateInput, PlanCalendar, StudentPlanState, WeekContext } from './plan';
import { localTime } from './time';

const TZ = 'Europe/Minsk';
const CAL: PlanCalendar = {
  year: { from: '2025-09-01', to: '2026-05-31' },
  terms: [
    { id: 'q1', start: '2025-09-01', end: '2025-10-25' },
    { id: 'q2', start: '2025-11-03', end: '2025-12-24' },
  ],
  holidays: [{ from: '2025-10-26', to: '2025-11-02' }],
};
const RULES = { weekStart: 1, schoolDays: [1, 2, 3, 4, 5, 6], noSchoolDates: [] as string[] };

/** A moment given as school-local "YYYY-MM-DD HH:MM" (Minsk is UTC+3 all year) */
const at = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:00`);

function ctx(nowLocal: string, over: Partial<WeekContext> = {}): WeekContext {
  const now = at(nowLocal);
  return {
    ...RULES,
    now,
    today: localTime(now, TZ).date,
    localDate: (d) => localTime(d, TZ).date,
    lastSuccessAt: null,
    ...over,
  };
}

const state = (coverage: [string, string][] = [], postTermDone: string[] = []): StudentPlanState => ({
  calendar: CAL,
  coverage: new Map(coverage.map(([w, v]) => [w, at(v)])),
  postTermDone: new Set(postTermDone),
});

/** Every school week from 1 Sep up to the week of `until`, verified right after it ended */
function verifiedThrough(until: string): [string, string][] {
  const out: [string, string][] = [];
  for (
    let d = new Date('2025-09-01T00:00:00Z');
    d.toISOString().slice(0, 10) <= until;
    d.setUTCDate(d.getUTCDate() + 7)
  ) {
    const w = d.toISOString().slice(0, 10);
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + 7);
    out.push([w, `${next.toISOString().slice(0, 10)} 10:00`]);
  }
  return out;
}

const sets = (r: { weekStart: string; set: string }[]) => r.map((x) => `${x.set} ${x.weekStart}`);

describe('selectWeeks', () => {
  it('a normal day: the current and the previous week, nothing else', () => {
    // last Friday's re-scan touched every week of the term
    const cov = verifiedThrough('2025-10-06').map(([w]) => [w, '2025-10-10 21:00'] as [string, string]);
    const r = selectWeeks(state(cov), ctx('2025-10-15 10:00', { lastSuccessAt: at('2025-10-15 09:10') }));
    expect(sets(r)).toEqual(['standing 2025-10-13', 'standing 2025-10-06']);
  });

  it('where the diary shows lessons ahead, the next week is standing too: a Friday run reads Monday', () => {
    const cov = verifiedThrough('2025-10-06').map(([w]) => [w, '2025-10-10 21:00'] as [string, string]);
    const friday = ctx('2025-10-17 12:00', { lastSuccessAt: at('2025-10-17 11:10'), readsAhead: true });
    // current, next, previous, before any gap or re-scan
    expect(sets(selectWeeks(state(cov), friday)).slice(0, 3)).toEqual([
      'standing 2025-10-13',
      'standing 2025-10-20',
      'standing 2025-10-06',
    ]);
    // without lessons ahead in the diary there is nothing to read there
    expect(sets(selectWeeks(state(cov), { ...friday, readsAhead: false }))).not.toContain('standing 2025-10-20');
  });

  it('the next week is the week of the next school day: holiday weeks are skipped, three weeks at most', () => {
    // Friday 24 October: the week of 27 October is the autumn holidays, school starts again on 3 November
    const friday = ctx('2025-10-24 12:00', { lastSuccessAt: at('2025-10-24 11:00'), readsAhead: true });
    expect(nextSchoolWeek(CAL, friday)).toBe('2025-11-03');
    const r = selectWeeks(state(verifiedThrough('2025-10-13')), friday);
    expect(sets(r).slice(0, 3)).toEqual(['standing 2025-10-20', 'standing 2025-11-03', 'standing 2025-10-13']);
    expect(r.map((x) => x.weekStart)).not.toContain('2025-10-27');
    // holidays longer than three weeks: nothing ahead to read yet
    const long = { ...CAL, holidays: [{ from: '2025-10-26', to: '2025-11-23' }] };
    expect(nextSchoolWeek(long, friday)).toBeNull();
    // after the school year there is no next week
    expect(nextSchoolWeek(CAL, ctx('2026-05-29 12:00', { readsAhead: true }))).toBeNull();
  });

  it('a day without school: the nearest school week is due when it was not read on the last school day or since', () => {
    // a five-day week: Friday 17 October is the last school day, Monday 20 October the next
    const five = { schoolDays: [1, 2, 3, 4, 5], readsAhead: true };
    const readThursday = state([['2025-10-20', '2025-10-16 12:00']]);
    expect(aheadDue(readThursday, ctx('2025-10-18 10:00', five))).toEqual({
      week: '2025-10-20',
      lastSchoolDay: '2025-10-17',
    });
    // read on Friday: nothing waits over the weekend
    expect(aheadDue(state([['2025-10-20', '2025-10-17 12:00']]), ctx('2025-10-18 10:00', five))).toBeNull();
    // a school day never has it, nor a provider without lessons ahead
    expect(aheadDue(readThursday, ctx('2025-10-17 18:00', five))).toBeNull();
    expect(aheadDue(readThursday, ctx('2025-10-18 10:00', { ...five, readsAhead: false }))).toBeNull();
    // the holidays: the week of 3 November, due until it has been read since Saturday 25 October
    expect(
      aheadDue(state([['2025-11-03', '2025-10-23 12:00']]), ctx('2025-10-29 10:00', { readsAhead: true })),
    ).toEqual({
      week: '2025-11-03',
      lastSchoolDay: '2025-10-25',
    });
  });

  it('after weeks off: standing first, the gap newest first, then the overdue re-scan', () => {
    const r = selectWeeks(
      state(verifiedThrough('2025-09-08').concat([['2025-09-15', '2025-09-17 10:00']])),
      ctx('2025-10-08 07:00', { lastSuccessAt: at('2025-09-17 10:00') }),
    );
    expect(sets(r)).toEqual([
      'standing 2025-10-06',
      'standing 2025-09-29',
      'gap 2025-09-22',
      'gap 2025-09-15',
      'rescan 2025-09-08',
      'rescan 2025-09-01',
    ]);
  });

  it('skips weeks that are all holiday', () => {
    const r = selectWeeks(
      state(verifiedThrough('2025-10-20')),
      ctx('2025-11-04 10:00', { lastSuccessAt: at('2025-11-04 09:00') }),
    );
    expect(r.map((x) => x.weekStart)).not.toContain('2025-10-27');
    expect(sets(r)).toEqual(['standing 2025-11-03']);
  });

  it('backfills never-verified weeks of the year, newest first, last', () => {
    const r = selectWeeks(state(), ctx('2025-09-24 10:00'));
    expect(sets(r)).toEqual([
      'standing 2025-09-22',
      'standing 2025-09-15',
      'backfill 2025-09-08',
      'backfill 2025-09-01',
    ]);
  });

  it('a family day off counts like a holiday', () => {
    const noSchool = ['2025-09-01', '2025-09-02', '2025-09-03', '2025-09-04', '2025-09-05', '2025-09-06'];
    const r = selectWeeks(state(), ctx('2025-09-24 10:00', { noSchoolDates: noSchool }));
    expect(r.map((x) => x.weekStart)).not.toContain('2025-09-01');
  });

  it('re-scans the stale weeks of the current term in any school-day run, after the standing weeks', () => {
    const cov = verifiedThrough('2025-10-06');
    const base = { lastSuccessAt: at('2025-10-17 09:00') };
    // the weeks of September were verified 10+ days ago: they are due, at any hour the gate allows a run
    expect(sets(selectWeeks(state(cov), ctx('2025-10-17 10:00', base)))).toContain('rescan 2025-09-01');
    // freshly re-scanned weeks are not due again
    const fresh = cov.map(([w]) => [w, '2025-10-16 10:00'] as [string, string]);
    expect(sets(selectWeeks(state(fresh), ctx('2025-10-17 10:00', base)))).toEqual([
      'standing 2025-10-13',
      'standing 2025-10-06',
    ]);
    // a stale week is not a backlog: it waits for the next school day instead of opening a catch-up
    expect(hasBacklog(selectWeeks(state(cov), ctx('2025-10-17 10:00', base)))).toBe(false);
  });

  it('fetches a finished term once more two weeks after its end', () => {
    const cov = verifiedThrough('2025-10-20').map(([w]) => [w, '2025-11-05 10:00'] as [string, string]);
    const c = ctx('2025-11-10 10:00', { lastSuccessAt: at('2025-11-10 09:00') });
    expect(sets(selectWeeks(state(cov), c))).toContain('post_term 2025-10-20');
    expect(hasPostTerm(selectWeeks(state(cov), c))).toBe(true);
    expect(sets(selectWeeks(state(cov, ['q1']), c))).not.toContain('post_term 2025-10-20');
  });
});

const LIMITS: EffectiveLimits = {
  envWindow: null,
  standIn: narrowWindow('08:00-14:00'),
  minLoginIntervalMinutes: 60,
  maxRequestsPerRun: 40,
  jitterMinutes: 20,
  catchupAfterMs: 24 * 3_600_000,
  offlineRetryMinutes: 10,
};

function gate(nowLocal: string, over: Partial<GateInput> = {}, account: Partial<GateInput['account']> = {}) {
  const now = at(nowLocal);
  return decideStart({
    now,
    local: localTime(now, TZ),
    timeZone: TZ,
    trigger: 'schedule',
    account: {
      pausedUntil: null,
      lastAttemptAt: at('2025-10-15 08:20'),
      lastSuccessAt: at('2025-10-15 08:20'),
      requiresAction: null,
      ...account,
    },
    limits: LIMITS,
    // the children's school day today, as window.ts computes it
    windows: [[480, 840]],
    weekday: true,
    backlog: false,
    postTerm: false,
    lastOfflineAt: null,
    seed: 'account-1',
    ...over,
  });
}

describe('decideStart', () => {
  it('runs hourly inside the window, a stable random delay after the login budget allows it', () => {
    const delay = jitterMinutes('account-1|2025-10-15|560', 20);
    const startAt = 560 + delay;
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    expect(gate(`2025-10-15 ${hhmm(startAt)}`)).toEqual({ start: true, kind: 'scheduled' });
    if (delay > 0) expect(gate(`2025-10-15 ${hhmm(startAt - 1)}`)).toMatchObject({ start: false, reason: 'jitter' });
  });

  it('never logs in twice within the interval; a manual try is recorded with the next allowed time', () => {
    expect(gate('2025-10-15 08:50')).toMatchObject({ start: false, reason: 'interval', record: null });
    expect(gate('2025-10-15 08:50', { trigger: 'user:u1' })).toEqual({
      start: false,
      reason: 'interval',
      record: 'skipped_interval',
      retryAt: at('2025-10-15 09:20'),
    });
  });

  it("counts a probe's login (last_login_at only) like an attempt", () => {
    const probe = { lastAttemptAt: at('2025-10-15 07:00'), lastLoginAt: at('2025-10-15 09:00') };
    expect(gate('2025-10-15 09:30', { trigger: 'user:u1' }, probe)).toMatchObject({
      start: false,
      reason: 'interval',
      retryAt: at('2025-10-15 10:00'),
    });
  });

  it('treats a clock that went backwards as an elapsed interval', () => {
    expect(gate('2025-10-15 12:00', {}, { lastAttemptAt: at('2025-10-16 12:00') }).start).toBe(true);
  });

  it('Friday missed: one run on Saturday in the manifest window, none on Sunday', () => {
    const friday = at('2025-10-16 12:00'); // the last read, Thursday
    const weekend = { windows: [], weekday: false, schoolDay: false };
    const acct = { lastSuccessAt: friday, lastAttemptAt: friday };
    // Saturday: the nearest school week waits (aheadDue): one run, in the manifest's window only
    expect(gate('2025-10-18 07:30', { ...weekend, ahead: true }, acct)).toMatchObject({ start: false });
    expect(gate('2025-10-18 10:00', { ...weekend, ahead: true }, acct)).toEqual({ start: true, kind: 'ahead' });
    expect(gate('2025-10-18 15:00', { ...weekend, ahead: true }, acct)).toMatchObject({ start: false });
    // Sunday after it: nothing waits, and two days since the last read are no reason on a day without school
    const saturday = at('2025-10-18 10:05');
    expect(gate('2025-10-19 12:00', weekend, { lastSuccessAt: saturday, lastAttemptAt: saturday })).toMatchObject({
      start: false,
      reason: 'outside_window',
    });
    expect(gate('2025-10-19 23:00', weekend, acct)).toMatchObject({ start: false, reason: 'outside_window' });
    // a real backlog still catches up at any hour
    expect(gate('2025-10-19 23:00', { ...weekend, backlog: true }, acct)).toEqual({ start: true, kind: 'catchup' });
  });

  it('stays outside the window unless it is a catch-up', () => {
    expect(gate('2025-10-15 18:00')).toMatchObject({ start: false, reason: 'outside_window' });
    expect(gate('2025-10-15 18:00', { backlog: true })).toEqual({ start: true, kind: 'catchup' });
    // the server was off for two days: any hour will do
    expect(gate('2025-10-17 03:00', {}, { lastSuccessAt: at('2025-10-15 08:20') })).toEqual({
      start: true,
      kind: 'catchup',
    });
    // a Sunday is not a school day
    expect(
      gate(
        '2025-10-19 10:00',
        { windows: [], weekday: false },
        { lastSuccessAt: at('2025-10-19 06:00'), lastAttemptAt: at('2025-10-19 06:00') },
      ),
    ).toMatchObject({
      start: false,
      reason: 'outside_window',
    });
  });

  it('a new account backfills at once', () => {
    expect(gate('2025-10-15 22:00', {}, { lastSuccessAt: null, lastAttemptAt: null })).toEqual({
      start: true,
      kind: 'backfill',
    });
  });

  it('two children, two windows: a run fits into either; between them only a catch-up', () => {
    // a first-grader until 13:45, a seventh-grader in the second shift from 12:10
    const windows: [number, number][] = [
      [450, 525],
      [730, 1000],
    ];
    expect(gate('2025-10-15 10:00', { windows }, { lastAttemptAt: at('2025-10-15 06:00') })).toMatchObject({
      reason: 'outside_window',
    });
    expect(gate('2025-10-15 15:00', { windows }, { lastAttemptAt: at('2025-10-15 06:00') }).start).toBe(true);
  });

  it('no reads in the evening, at weekends or in the holidays, re-scan included', () => {
    // a success at noon today: nothing is overdue, so the evening and the holidays stay quiet
    const fresh = (day: string) => ({ lastSuccessAt: at(day + ' 12:00'), lastAttemptAt: at(day + ' 12:00') });
    expect(gate('2025-10-17 21:00', {}, fresh('2025-10-17'))).toMatchObject({ start: false, reason: 'outside_window' });
    expect(gate('2025-11-03 15:00', { windows: [] }, fresh('2025-11-03'))).toMatchObject({
      start: false,
      reason: 'outside_window',
    });
  });

  it('a finished term due in the holidays: one run in the manifest window on a weekday', () => {
    const holidays = { windows: [] as [number, number][], postTerm: true };
    const recent = { lastSuccessAt: at('2025-11-03 08:00'), lastAttemptAt: at('2025-11-03 08:00') };
    expect(gate('2025-11-03 13:40', holidays, recent)).toEqual({ start: true, kind: 'rescan' });
    expect(gate('2025-11-03 18:00', holidays, recent)).toMatchObject({ start: false, reason: 'outside_window' });
    expect(
      gate(
        '2025-11-02 13:40',
        { ...holidays, weekday: false },
        { lastSuccessAt: at('2025-11-02 08:00'), lastAttemptAt: at('2025-11-02 08:00') },
      ),
    ).toMatchObject({
      start: false,
      reason: 'outside_window',
    });
  });

  it('a pause holds scheduled runs, not a person pressing the button', () => {
    const paused = { pausedUntil: at('2025-10-16 08:00') };
    expect(gate('2025-10-15 11:00', {}, paused)).toMatchObject({ start: false, reason: 'paused' });
    expect(gate('2025-10-15 11:00', { trigger: 'user:u1' }, paused)).toEqual({ start: true, kind: 'manual' });
  });

  it('an account that needs action is never tried, not even manually', () => {
    expect(gate('2025-10-15 11:00', { trigger: 'cli' }, { requiresAction: 'auth' })).toMatchObject({
      start: false,
      reason: 'requires_action',
    });
  });

  it('waits after an offline check before checking again', () => {
    expect(gate('2025-10-15 11:00', { lastOfflineAt: at('2025-10-15 10:55') })).toMatchObject({
      reason: 'offline_retry',
    });
    expect(gate('2025-10-15 11:30', { lastOfflineAt: at('2025-10-15 10:55') }).start).toBe(true);
  });

  it('narrows windows: environment and family can only make them stricter', () => {
    expect(narrowWindow('08:00-14:00', '09:00-16:00', null)).toEqual([540, 840]);
    expect(narrowWindow('08:00-14:00', '15:00-16:00')).toBeNull();
  });
});
