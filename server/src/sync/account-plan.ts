import type { ProviderManifest } from '@marksy/core';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { diaryAccounts, families, syncRuns } from '../db/schema';
import { effectiveLimits } from './config';
import type { SyncConfig } from './config';
import { decideStart } from './plan';
import type { GateDecision } from './plan';
import { readableStudents, sourcedStudents } from './readers';
import { accountToday, lastAheadOf, nextSchoolDayOf, weekContext } from './state';
import type { AccountToday, NextSchoolDay } from './state';
import { localTime } from './time';
import type { LocalTime } from './time';

// What the planner thinks of one diary account right now (docs/design.md 10.4), without logging in anywhere: each
// child's school day today, the account's window, the weeks waiting per set, and whether a scheduled run would start
// now and if not, why. Shared by `pnpm sync:plan` (text) and Sync (sync.title, /api/sync/status). It reads the manifest as
// data and never loads provider code (plan-report.test.ts checks the import graph).

export interface AccountPlan {
  local: LocalTime;
  /** a login that only confirms it still shows its children (design.md 10.4, source checks) */
  sourceCheck: boolean;
  readable: string[];
  sourced: string[];
  today: AccountToday;
  decision: GateDecision;
  maxRequestsPerRun: number;
  /** The next school day after today, for "next Mon, 9 Nov at 08:13" (more.sync.nextOn) when today's windows are over */
  nextSchoolDay: NextSchoolDay | null;
}

export async function accountPlan(
  db: Db,
  account: typeof diaryAccounts.$inferSelect,
  manifest: ProviderManifest,
  config: SyncConfig,
  now: Date,
): Promise<AccountPlan> {
  const [family] = await db.select().from(families).where(eq(families.id, account.familyId));
  const limits = effectiveLimits(manifest, config);
  const local = localTime(now, manifest.timezone);
  const ctx = weekContext(manifest, family?.settings ?? {}, now, account.lastSuccessAt);
  const readable = (await readableStudents(db, account.id)).map((s) => s.id);
  const sourced = readable.length ? [] : await sourcedStudents(db, account.id);
  const sourceCheck = sourced.length > 0;
  const today = await accountToday(
    db,
    sourceCheck ? sourced : readable,
    ctx,
    limits,
    await lastAheadOf(db, account.id),
  );
  const [lastOffline] = await db
    .select({ startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.diaryAccountId, account.id), eq(syncRuns.status, 'skipped_offline')))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);
  const decision = decideStart({
    now,
    local,
    timeZone: manifest.timezone,
    trigger: 'schedule',
    account,
    limits,
    windows: today.windows,
    weekday: manifest.calendar.schoolDays.includes(local.weekday),
    backlog: sourceCheck ? false : today.backlog || readable.length === 0,
    postTerm: sourceCheck ? false : today.postTerm,
    ahead: sourceCheck ? false : today.ahead,
    schoolDay: today.schoolDay,
    lastOfflineAt: lastOffline?.startedAt ?? null,
    seed: account.id,
  });
  const nextSchoolDay = await nextSchoolDayOf(db, sourceCheck ? sourced : readable, ctx, limits);
  return {
    local,
    sourceCheck,
    readable,
    sourced,
    today,
    decision,
    maxRequestsPerRun: limits.maxRequestsPerRun,
    nextSchoolDay,
  };
}
