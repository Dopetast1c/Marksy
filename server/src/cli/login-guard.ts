import { createHash } from 'node:crypto';
import type { ISODate } from '@marksy/core';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { cliLogins, diaryAccounts } from '../db/schema';
import { fromLocal, localTime } from '../sync/time';

// The login guard of `pnpm probe` and `pnpm sync:once` (CLAUDE.md "Real diary runs"): one real login per account and
// login interval, shared with the scheduler through diary_accounts.last_login_at, for whoever runs them; for Claude
// Code (MARKSY_RUNNER=claude) also at most three runs a day, only between 07:00 and 20:00 in the school's time zone.
// A refusal names the next allowed time; nothing is retried here.

export type Runner = 'owner' | 'claude';
export type CliCommand = 'probe' | 'sync:once';

export const CLAUDE_RUNS_PER_DAY = 3;
/** Local minutes: 07:00 to 20:00 */
export const CLAUDE_HOURS: readonly [number, number] = [7 * 60, 20 * 60];

export const runnerOf = (env: Record<string, string | undefined> = process.env): Runner =>
  env.MARKSY_RUNNER === 'claude' ? 'claude' : 'owner';

export const loginHash = (login: string) => createHash('sha256').update(login.trim().toLowerCase()).digest('hex');

export interface LoginClaim {
  providerId: string;
  login: string;
  command: CliCommand;
  runner: Runner;
  minLoginIntervalMinutes: number;
  /** The school's time zone (the provider manifest's) */
  timezone: string;
  now: Date;
}

export type ClaimResult = { ok: true } | { ok: false; reason: 'interval' | 'daily_cap' | 'hours'; nextAllowedAt: Date };

const nextDay = (date: ISODate) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Allows and records one real login, or refuses with the next allowed time. A probe also stamps the account's
 * last_login_at, so the scheduler keeps the interval; sync:once leaves that to the run itself.
 */
export async function claimLogin(db: Db, c: LoginClaim): Promise<ClaimResult> {
  const hash = loginHash(c.login);
  const [account] = await db
    .select({ id: diaryAccounts.id, lastLoginAt: diaryAccounts.lastLoginAt })
    .from(diaryAccounts)
    .where(
      and(eq(diaryAccounts.providerId, c.providerId), sql`lower(${diaryAccounts.label}) = lower(${c.login.trim()})`),
    );
  const [lastCli] = await db
    .select({ at: cliLogins.at })
    .from(cliLogins)
    .where(and(eq(cliLogins.providerId, c.providerId), eq(cliLogins.loginHash, hash)))
    .orderBy(desc(cliLogins.at))
    .limit(1);
  const last = Math.max(account?.lastLoginAt?.getTime() ?? 0, lastCli?.at.getTime() ?? 0);
  const intervalEnd = new Date(last + c.minLoginIntervalMinutes * 60_000);

  const local = localTime(c.now, c.timezone);
  const opensAt = (date: ISODate) => fromLocal(date, CLAUDE_HOURS[0], c.timezone);
  if (c.runner === 'claude') {
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(cliLogins)
      .where(and(eq(cliLogins.runner, 'claude'), gte(cliLogins.at, fromLocal(local.date, 0, c.timezone))));
    if (n >= CLAUDE_RUNS_PER_DAY)
      return { ok: false, reason: 'daily_cap', nextAllowedAt: opensAt(nextDay(local.date)) };
    if (local.minutes < CLAUDE_HOURS[0]) return { ok: false, reason: 'hours', nextAllowedAt: opensAt(local.date) };
    if (local.minutes >= CLAUDE_HOURS[1])
      return { ok: false, reason: 'hours', nextAllowedAt: opensAt(nextDay(local.date)) };
  }
  if (intervalEnd > c.now) {
    // for Claude Code, an interval that ends after hours moves to the next morning
    const end = localTime(intervalEnd, c.timezone);
    const late = c.runner === 'claude' && (end.date !== local.date || end.minutes >= CLAUDE_HOURS[1]);
    return { ok: false, reason: 'interval', nextAllowedAt: late ? opensAt(nextDay(local.date)) : intervalEnd };
  }

  await db.insert(cliLogins).values({
    providerId: c.providerId,
    diaryAccountId: account?.id ?? null,
    loginHash: hash,
    command: c.command,
    runner: c.runner,
    at: c.now,
  });
  if (account && c.command === 'probe')
    await db.update(diaryAccounts).set({ lastLoginAt: c.now }).where(eq(diaryAccounts.id, account.id));
  return { ok: true };
}

/** One line for the terminal: what was refused and when the next run is allowed, never the login */
export function refusalText(r: Exclude<ClaimResult, { ok: true }>, timezone: string): string {
  const at = localTime(r.nextAllowedAt, timezone);
  const when = `${at.date} ${String(Math.floor(at.minutes / 60)).padStart(2, '0')}:${String(at.minutes % 60).padStart(2, '0')} (${timezone})`;
  const why = {
    interval: 'this account logged in to the diary less than the login interval ago',
    daily_cap: `Claude Code already started ${CLAUDE_RUNS_PER_DAY} real runs today`,
    hours: 'Claude Code runs real logins only between 07:00 and 20:00 school time',
  }[r.reason];
  return `not run: ${why}; next allowed at ${when}. Do not retry in a loop.`;
}
