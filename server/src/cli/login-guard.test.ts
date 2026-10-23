import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { createAccount, DEMO_CREDENTIALS } from '../../test/factories';
import { cliLogins, diaryAccounts } from '../db/schema';
import { claimLogin, refusalText, runnerOf } from './login-guard';
import type { LoginClaim } from './login-guard';

const db = testDb();
const TZ = 'Europe/Minsk';
// Tuesday 13 Oct 2026, 10:00 in Minsk (UTC+3)
const at = (hhmm: string, day = '2026-10-13') => new Date(`${day}T${hhmm}:00+03:00`);
const claim = (over: Partial<LoginClaim> = {}): LoginClaim => ({
  providerId: 'demo-full',
  login: DEMO_CREDENTIALS.login,
  command: 'probe',
  runner: 'claude',
  minLoginIntervalMinutes: 60,
  timezone: TZ,
  now: at('10:00'),
  ...over,
});

describe('login guard of probe and sync:once', () => {
  beforeEach(() => resetDb(db));

  it('Claude Code: one login an hour, shared with the scheduler, and a probe stamps the account', async () => {
    const { account } = await createAccount(db, 'demo-full', { lastLoginAt: at('09:30') });
    expect(await claimLogin(db, claim())).toEqual({ ok: false, reason: 'interval', nextAllowedAt: at('10:30') });
    expect(await claimLogin(db, claim({ now: at('10:31') }))).toEqual({ ok: true });
    const [row] = await db.select().from(diaryAccounts).where(eq(diaryAccounts.id, account.id));
    expect(row!.lastLoginAt).toEqual(at('10:31'));
    // the next one, a sync:once, waits for the probe's hour; the login is matched without regard to case
    const next = await claimLogin(db, claim({ command: 'sync:once', login: 'PARENT@example.com', now: at('11:00') }));
    expect(next).toEqual({ ok: false, reason: 'interval', nextAllowedAt: at('11:31') });
  });

  it('a probe before any diary account still counts, by a hash of the login', async () => {
    expect(await claimLogin(db, claim())).toEqual({ ok: true });
    expect(await claimLogin(db, claim({ now: at('10:20') }))).toMatchObject({ ok: false, reason: 'interval' });
    const [row] = await db.select().from(cliLogins);
    expect(row).toMatchObject({ runner: 'claude', command: 'probe', diaryAccountId: null });
    expect(JSON.stringify(row)).not.toContain(DEMO_CREDENTIALS.login);
  });

  it('Claude Code: at most three runs a day, then tomorrow at 07:00', async () => {
    for (const t of ['08:00', '10:00', '12:00'])
      expect(await claimLogin(db, claim({ now: at(t), login: `p${t}@example.com` }))).toEqual({ ok: true });
    const fourth = await claimLogin(db, claim({ now: at('15:00'), login: 'other@example.com' }));
    expect(fourth).toEqual({ ok: false, reason: 'daily_cap', nextAllowedAt: at('07:00', '2026-10-14') });
    expect(refusalText(fourth as Exclude<typeof fourth, { ok: true }>, TZ)).toBe(
      `not run: Claude Code already started 3 real runs today; next allowed at 2026-10-14 07:00 (${TZ}). Do not retry in a loop.`,
    );
    // the owner is not counted against it, and has no cap
    expect(await claimLogin(db, claim({ runner: 'owner', now: at('15:00'), login: 'owner@example.com' }))).toEqual({
      ok: true,
    });
  });

  it('Claude Code: only from 07:00 to 20:00 school time; an interval ending later moves to the morning', async () => {
    expect(await claimLogin(db, claim({ now: at('06:30') }))).toEqual({
      ok: false,
      reason: 'hours',
      nextAllowedAt: at('07:00'),
    });
    expect(await claimLogin(db, claim({ now: at('20:00') }))).toEqual({
      ok: false,
      reason: 'hours',
      nextAllowedAt: at('07:00', '2026-10-14'),
    });
    await createAccount(db, 'demo-full', { lastLoginAt: at('19:30') });
    expect(await claimLogin(db, claim({ now: at('19:45') }))).toEqual({
      ok: false,
      reason: 'interval',
      nextAllowedAt: at('07:00', '2026-10-14'),
    });
    // the owner may run at night, the interval still holds
    expect(await claimLogin(db, claim({ runner: 'owner', now: at('20:31') }))).toEqual({ ok: true });
    expect(await db.select().from(cliLogins)).toHaveLength(1);
  });

  it('MARKSY_RUNNER=claude or a Claude Code shell (CLAUDECODE=1) marks Claude Code; anything else is the owner', () => {
    expect(runnerOf({ MARKSY_RUNNER: 'claude' })).toBe('claude');
    expect(runnerOf({ CLAUDECODE: '1', MARKSY_RUNNER: 'owner' })).toBe('claude');
    expect(runnerOf({})).toBe('owner');
  });

  it('two runs started together: one passes, the other waits for the interval', async () => {
    const results = await Promise.all([claimLogin(db, claim()), claimLogin(db, claim({ command: 'sync:once' }))]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([expect.objectContaining({ reason: 'interval' })]);
  });
});
