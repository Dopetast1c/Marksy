import { createHash } from 'node:crypto';
import type { ISODate } from '@marksy/core';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import type { Tx } from '../sync/upsert';
import { cliLogins, diaryAccounts } from '../db/schema';
import { fromLocal, localTime } from '../sync/time';

// The login guard of `pnpm probe`, `pnpm sync:once` and `pnpm dev:connect` (CLAUDE.md "Real diary runs"): one real
// login per account and interval, shared with the scheduler through diary_accounts.last_login_at, for whoever runs
// them. The interval and, for Claude Code (MARKSY_RUNNER=claude), a daily cap and school hours come from the mode
// (cli/mode.ts: development 10 minutes, any hour, no cap; production the manifest's interval, three runs, 07:00 to
// 20:00). A refusal names the next allowed time; nothing is retried here. Claude Code never tries a login the diary
// refused (the account's requires_action, or the last run's outcome here) and never runs while the account is paused;
// the owner may, which is how a corrected password is checked.

export type Runner = 'owner' | 'claude';
export type CliCommand = 'probe' | 'sync:once' | 'dev:connect';

export const CLAUDE_RUNS_PER_DAY = 3;
/** Local minutes: 07:00 to 20:00 */
export const CLAUDE_HOURS: readonly [number, number] = [7 * 60, 20 * 60];

/** Claude Code: MARKSY_RUNNER=claude (.claude/settings.json), or the CLAUDECODE=1 every Claude Code shell has */
export const runnerOf = (env: Record<string, string | undefined> = process.env): Runner =>
  env.MARKSY_RUNNER === 'claude' || env.CLAUDECODE === '1' ? 'claude' : 'owner';

/** One advisory lock for every claim: two runs started together cannot both pass */
const CLAIM_LOCK = 7_341_001;

export const loginHash = (login: string) => createHash('sha256').update(login.trim().toLowerCase()).digest('hex');

export interface LoginClaim {
  providerId: string;
  login: string;
  command: CliCommand;
  runner: Runner;
  policy: LoginPolicy;
  /** The school's time zone (the provider manifest's) */
  timezone: string;
  now: Date;
}

/** What a mode allows for manual real runs (cli/mode.ts) */
export interface LoginPolicy {
  intervalMinutes: number;
  /** Claude Code's runs per school-local day; null: no cap */
  claudeRunsPerDay: number | null;
  /** Claude Code's hours, local minutes [from, to); null: any hour */
  claudeHours: readonly [number, number] | null;
}

/** What the diary answered to a refused login */
export type RefusedLogin = 'auth' | 'blocked' | 'needs_2fa';

export type ClaimResult =
  | { ok: true }
  | { ok: false; reason: 'interval' | 'daily_cap' | 'hours' | 'paused'; nextAllowedAt: Date }
  /** Claude Code only: the diary refused this login, and only the owner may try it again */
  | { ok: false; reason: 'refused_login'; refused: RefusedLogin };

const nextDay = (date: ISODate) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * Allows and records one real login, or refuses with the next allowed time. A probe also stamps the account's
 * last_login_at, so the scheduler keeps the interval; sync:once leaves that to the run itself.
 */
export async function claimLogin(db: Db, c: LoginClaim): Promise<ClaimResult> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${CLAIM_LOCK})`);
    return claimIn(tx, c);
  });
}

async function claimIn(db: Tx, c: LoginClaim): Promise<ClaimResult> {
  const hash = loginHash(c.login);
  const [account] = await db
    .select({
      id: diaryAccounts.id,
      lastLoginAt: diaryAccounts.lastLoginAt,
      requiresAction: diaryAccounts.requiresAction,
      pausedUntil: diaryAccounts.pausedUntil,
    })
    .from(diaryAccounts)
    .where(
      and(eq(diaryAccounts.providerId, c.providerId), sql`lower(${diaryAccounts.label}) = lower(${c.login.trim()})`),
    );
  const [lastCli] = await db
    .select({ at: cliLogins.at, outcome: cliLogins.outcome })
    .from(cliLogins)
    .where(and(eq(cliLogins.providerId, c.providerId), eq(cliLogins.loginHash, hash)))
    .orderBy(desc(cliLogins.at))
    .limit(1);
  const last = Math.max(account?.lastLoginAt?.getTime() ?? 0, lastCli?.at.getTime() ?? 0);
  const intervalEnd = new Date(last + c.policy.intervalMinutes * 60_000);
  const { claudeRunsPerDay: cap, claudeHours: hours } = c.policy;

  if (c.runner === 'claude') {
    const refused = account?.requiresAction ?? lastCli?.outcome;
    if (refused) return { ok: false, reason: 'refused_login', refused };
    if (account?.pausedUntil && account.pausedUntil > c.now)
      return { ok: false, reason: 'paused', nextAllowedAt: account.pausedUntil };
  }

  const local = localTime(c.now, c.timezone);
  const opensAt = (date: ISODate) => fromLocal(date, hours?.[0] ?? 0, c.timezone);
  if (c.runner === 'claude' && cap !== null) {
    const [{ n } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(cliLogins)
      .where(and(eq(cliLogins.runner, 'claude'), gte(cliLogins.at, fromLocal(local.date, 0, c.timezone))));
    if (n >= cap) return { ok: false, reason: 'daily_cap', nextAllowedAt: opensAt(nextDay(local.date)) };
  }
  if (c.runner === 'claude' && hours) {
    if (local.minutes < hours[0]) return { ok: false, reason: 'hours', nextAllowedAt: opensAt(local.date) };
    if (local.minutes >= hours[1]) return { ok: false, reason: 'hours', nextAllowedAt: opensAt(nextDay(local.date)) };
  }
  if (intervalEnd > c.now) {
    // for Claude Code, an interval that ends after hours moves to the next morning
    const end = localTime(intervalEnd, c.timezone);
    const late = c.runner === 'claude' && !!hours && (end.date !== local.date || end.minutes >= hours[1]);
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
/** The diary refused the login a run claimed: kept on that run's row, so Claude Code's next claim waits for the owner */
export async function recordRefusedLogin(
  db: Db,
  r: { providerId: string; login: string; refused: RefusedLogin },
): Promise<void> {
  const [last] = await db
    .select({ id: cliLogins.id })
    .from(cliLogins)
    .where(and(eq(cliLogins.providerId, r.providerId), eq(cliLogins.loginHash, loginHash(r.login))))
    .orderBy(desc(cliLogins.at))
    .limit(1);
  if (last) await db.update(cliLogins).set({ outcome: r.refused }).where(eq(cliLogins.id, last.id));
}

export function refusalText(r: Exclude<ClaimResult, { ok: true }>, timezone: string, policy?: LoginPolicy): string {
  if (r.reason === 'refused_login')
    return `not run: the diary refused this login (${r.refused}) at its last run; only the owner may try it again, after checking it. Tell the owner; do not retry.`;
  const at = localTime(r.nextAllowedAt, timezone);
  const when = `${at.date} ${String(Math.floor(at.minutes / 60)).padStart(2, '0')}:${String(at.minutes % 60).padStart(2, '0')} (${timezone})`;
  const why = {
    interval: 'this account logged in to the diary less than the login interval ago',
    daily_cap: `Claude Code already started ${policy?.claudeRunsPerDay ?? CLAUDE_RUNS_PER_DAY} real runs today`,
    hours: 'Claude Code runs real logins only between 07:00 and 20:00 school time',
    paused: 'the account is paused after repeated diary failures',
  }[r.reason];
  return `not run: ${why}; next allowed at ${when}. Do not retry in a loop.`;
}
