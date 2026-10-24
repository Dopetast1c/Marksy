import type { DiaryProvider, ISODate, Logger, Transport } from '@marksy/core';
import { getProvider } from '@marksy/registry';
import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { diaryAccounts, families, syncRuns, termRescans } from '../db/schema';
import type { SyncErrorClass, SyncRunScope, SyncRunStats, SyncRunStatus } from '../db/schema';
import { decryptCredentials, masterKey } from '../crypto/credentials';
import { notifyAdmins } from '../notify/admin';
import type { AdminNotice } from '../notify/admin';
import { runCollector } from './collector';
import type { WeekRequest } from './collector';
import { effectiveLimits } from './config';
import type { SyncConfig } from './config';
import { checkOnline } from './connectivity';
import type { OnlineCheck } from './connectivity';
import { applyOutcome } from './failures';
import type { Alert } from './failures';
import { decideStart, isManual, selectWeeks, termBookkeeping } from './plan';
import type { GateDecision, Trigger } from './plan';
import { accountToday, planCalendarOf, planState, storedPlanCalendar, weekContext } from './state';
import { readableStudents, sourcedStudents } from './readers';
import { rebalanceAccount } from './sources';
import type { OpenedLogin } from './opened';
import { localTime } from './time';

// One attempt to sync one diary account (docs/design.md 10.4), whatever triggered it: the scheduler's tick, the
// start-up tick, `pnpm sync:once` or (M5d) the refresh button. It takes the account's advisory lock, asks the planner
// whether it may start, checks that this machine is online, records the attempt in sync_runs, runs the collector and
// applies the outcome to the account (counter, pause, required action) and to the admins' inbox.

export interface RunSyncOptions {
  db: Db;
  accountId: string;
  trigger: Trigger;
  config: SyncConfig;
  now?: () => Date;
  provider?: (id: string) => DiaryProvider | undefined;
  transport?: Transport;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  online?: OnlineCheck;
  log?: Logger;
  credentialsKey?: Buffer;
  /**
   * A login connecting the diary opened already, and the connect run it belongs to: the first sync goes on in it at
   * once, past the gate (the login was this hour's), without a second login (design.md 7.2, 10.4)
   */
  opened?: { login: OpenedLogin; runId: string };
  /**
   * A command-line run's login interval in this mode (cli/mode.ts: 10 minutes in development), checked by the login
   * guard already; SYNC_MIN_LOGIN_INTERVAL still tightens it. Ignored for every other trigger (the scheduler, the
   * app's refresh), which keep the manifest's
   */
  manualLoginIntervalMinutes?: number;
}

export type RunSyncResult =
  | { outcome: 'locked' }
  | { outcome: 'unknown_account' }
  | { outcome: 'skipped'; decision: Extract<GateDecision, { start: false }>; runId?: string }
  | { outcome: 'offline'; runId: string }
  | {
      outcome: 'ran';
      runId: string;
      status: SyncRunStatus;
      errorClass: SyncErrorClass | null;
      requests: number;
      stats: SyncRunStats;
    };

const NOTICES: Record<Alert, Omit<AdminNotice, 'eventKey' | 'params'>> = {
  paused: {
    severity: 'warning',
    title: 'notification.syncPaused.title',
    body: 'notification.syncPaused.body',
  },
  auth: { severity: 'critical', title: 'notification.syncAuth.title', body: 'notification.syncAuth.body' },
  blocked: { severity: 'critical', title: 'notification.syncBlocked.title', body: 'notification.syncBlocked.body' },
  needs_2fa: {
    severity: 'critical',
    title: 'notification.syncNeeds2fa.title',
    body: 'notification.syncNeeds2fa.body',
  },
};

/** Runs fn while holding the account's advisory lock; null when another tick holds it. */
async function withAccountLock<T>(db: Db, accountId: string, fn: () => Promise<T>): Promise<T | null> {
  const client = await db.$client.connect();
  try {
    const { rows } = await client.query<{ ok: boolean }>('select pg_try_advisory_lock(hashtextextended($1, 0)) as ok', [
      accountId,
    ]);
    if (!rows[0]?.ok) return null;
    try {
      return await fn();
    } finally {
      await client.query('select pg_advisory_unlock(hashtextextended($1, 0))', [accountId]);
    }
  } finally {
    client.release();
  }
}

export async function runSync(opts: RunSyncOptions): Promise<RunSyncResult> {
  const result = await withAccountLock(opts.db, opts.accountId, () => runLocked(opts));
  return result ?? { outcome: 'locked' };
}

async function runLocked(opts: RunSyncOptions): Promise<RunSyncResult> {
  const { db, config } = opts;
  const now = opts.now ?? (() => new Date());
  const [account] = await db.select().from(diaryAccounts).where(eq(diaryAccounts.id, opts.accountId));
  const provider = account && (opts.provider ?? getProvider)(account.providerId);
  if (!account || !provider) return { outcome: 'unknown_account' };
  const [family] = await db.select().from(families).where(eq(families.id, account.familyId));
  const settings = family?.settings ?? {};
  const manifest = provider.manifest;
  const limits = effectiveLimits(manifest, config);
  if (opts.manualLoginIntervalMinutes !== undefined && (opts.trigger === 'cli' || opts.trigger === 'cli-claude'))
    limits.minLoginIntervalMinutes = Math.max(opts.manualLoginIntervalMinutes, config.minLoginIntervalMinutes ?? 0);
  const started = now();
  const local = localTime(started, manifest.timezone);
  const ctx = weekContext(manifest, settings, started, account.lastSuccessAt);

  if (opts.opened) {
    return execute(opts, { account, provider, ctx, limits, started, runId: opts.opened.runId, sourceCheck: false });
  }

  // what the stored state says, before anyone logs in: each child's school day today and what is waiting
  const pupils = await readableStudents(db, account.id);
  // an account that is the active source of none of the children it shows only checks, once a school day, that it
  // still shows them (design.md 10.4, "Source checks")
  const sourced = pupils.length ? [] : await sourcedStudents(db, account.id);
  const sourceCheck = sourced.length > 0;
  const today = await accountToday(db, sourceCheck ? sourced : pupils.map((p) => p.id), ctx, limits);
  const [lastOffline] = await db
    .select({ startedAt: syncRuns.startedAt })
    .from(syncRuns)
    .where(and(eq(syncRuns.diaryAccountId, account.id), eq(syncRuns.status, 'skipped_offline')))
    .orderBy(desc(syncRuns.startedAt))
    .limit(1);

  // a source check happens once a school day: decided before the gate, whose jitter must not hide it
  const checkedToday =
    sourceCheck && !!account.lastSuccessAt && localTime(account.lastSuccessAt, manifest.timezone).date === local.date;
  if (checkedToday && !isManual(opts.trigger)) {
    return { outcome: 'skipped', decision: { start: false, reason: 'checked_today', record: null } };
  }
  const decision = decideStart({
    now: started,
    local,
    timeZone: manifest.timezone,
    trigger: opts.trigger,
    account,
    limits,
    windows: today.windows,
    weekday: manifest.calendar.schoolDays.includes(local.weekday),
    // an account that reads no child yet (just connected) has everything waiting; a source check has nothing
    backlog: sourceCheck ? false : today.backlog || pupils.length === 0,
    postTerm: sourceCheck ? false : today.postTerm,
    lastOfflineAt: lastOffline?.startedAt ?? null,
    seed: account.id,
  });
  const base = {
    familyId: account.familyId,
    diaryAccountId: account.id,
    providerId: account.providerId,
    trigger: opts.trigger,
    startedAt: started,
  };
  const kind = sourceCheck && decision.start ? 'source_check' : decision.start ? decision.kind : 'manual';
  if (!decision.start) {
    if (!decision.record) return { outcome: 'skipped', decision };
    const [row] = await db
      .insert(syncRuns)
      .values({ ...base, kind: 'manual', status: decision.record, finishedAt: started, durationMs: 0 })
      .returning({ id: syncRuns.id });
    return { outcome: 'skipped', decision, runId: row!.id };
  }

  // offline is this machine's problem: recorded, never counted against the diary, no login
  if (!(await (opts.online ?? checkOnline)(manifest.network.baseUrl))) {
    const [row] = await db
      .insert(syncRuns)
      .values({
        ...base,
        kind,
        status: 'skipped_offline',
        errorClass: 'offline',
        finishedAt: now(),
        durationMs: 0,
      })
      .returning({ id: syncRuns.id });
    opts.log?.info('sync skipped: offline', { provider: account.providerId });
    return { outcome: 'offline', runId: row!.id };
  }

  const [run] = await db
    .insert(syncRuns)
    .values({ ...base, kind, status: 'running' })
    .returning({ id: syncRuns.id });
  const runId = run!.id;
  await db
    .update(diaryAccounts)
    .set({ lastAttemptAt: started, lastLoginAt: started })
    .where(eq(diaryAccounts.id, account.id));

  return execute(opts, { account, provider, ctx, limits, started, runId, sourceCheck });
}

interface Running {
  account: typeof diaryAccounts.$inferSelect;
  provider: DiaryProvider;
  ctx: ReturnType<typeof weekContext>;
  limits: ReturnType<typeof effectiveLimits>;
  started: Date;
  runId: string;
  sourceCheck: boolean;
}

/** The run once its row exists: credentials, the collector, the outcome on the run, the account and the inbox */
async function execute(opts: RunSyncOptions, r: Running): Promise<RunSyncResult> {
  const { db, config } = opts;
  const now = opts.now ?? (() => new Date());
  const { account, provider, ctx, limits, started, runId, sourceCheck } = r;
  const planned: Record<string, ISODate[]> = {};
  const sets: Record<string, number> = {};
  let credentials: Record<string, string> = {};
  try {
    if (opts.opened) {
      // no login here: the opened one is used
    } else if (!account.credentialsEnc) throw new Error('no credentials');
    else credentials = decryptCredentials(account.credentialsEnc, account.familyId, opts.credentialsKey ?? masterKey());
  } catch (err) {
    const error = err instanceof Error && err.message === 'no credentials' ? 'NoCredentials' : 'CredentialsKeyError';
    await db
      .update(syncRuns)
      .set({ status: 'failed', error, finishedAt: now(), durationMs: now().getTime() - started.getTime() })
      .where(eq(syncRuns.id, runId));
    return { outcome: 'ran', runId, status: 'failed', errorClass: null, requests: 0, stats: {} };
  }

  const collected = await runCollector({
    accountOnly: sourceCheck,
    ...(opts.opened && { opened: opts.opened.login }),
    db,
    provider,
    account,
    credentials,
    runId,
    plan: async ({ student, calendar, stored }) => {
      const state = await planState(db, student.id, planCalendarOf(calendar, stored.termIds));
      const weeks: WeekRequest[] = selectWeeks(state, ctx);
      planned[student.id] = weeks.map((w) => w.weekStart);
      for (const w of weeks) sets[w.set] = (sets[w.set] ?? 0) + 1;
      return weeks;
    },
    stricter: { maxRequestsPerRun: limits.maxRequestsPerRun },
    ...(opts.transport && { transport: opts.transport }),
    ...(opts.sleep && { sleep: opts.sleep }),
    ...(opts.random && { random: opts.random }),
    ...(opts.log && { log: opts.log }),
    now,
  });

  const finished = now();
  const scope: SyncRunScope = { student_ids: collected.students.map((s) => s.id), weeks: planned, sets };
  await db
    .update(syncRuns)
    .set({
      status: collected.status,
      errorClass: collected.errorClass,
      error: collected.error,
      requests: collected.requests,
      stats: collected.stats,
      scope,
      finishedAt: finished,
      durationMs: finished.getTime() - started.getTime(),
    })
    .where(eq(syncRuns.id, runId));

  const { patch, alert } = applyOutcome(account, { ...collected, manual: isManual(opts.trigger) }, finished, config);
  await db.update(diaryAccounts).set(patch).where(eq(diaryAccounts.id, account.id));
  // a paused account or one that needs action hands its children to another source that can read
  await rebalanceAccount(db, account.id, finished);
  if (alert) {
    await notifyAdmins(db, account.familyId, {
      ...NOTICES[alert],
      eventKey: `sync:${alert}:${account.id}:${finished.toISOString()}`,
      params: patch.pausedUntil ? { until: patch.pausedUntil.toISOString() } : {},
    });
  }
  for (const d of collected.newDrift) {
    opts.log?.warn('api drift', { provider: account.providerId, endpoint: d.endpoint, kind: d.kind, path: d.path });
    await notifyAdmins(db, account.familyId, {
      severity: 'info',
      title: 'notification.drift.title',
      body: 'notification.drift.body',
      eventKey: `drift:${account.providerId}:${d.endpoint}:${d.kind}:${d.path}`,
      params: { endpoint: d.endpoint, kind: d.kind, path: d.path },
    });
  }
  if (collected.status !== 'failed') await recordRescans(db, collected.students, ctx, finished);

  return {
    outcome: 'ran',
    runId,
    status: collected.status,
    errorClass: collected.errorClass,
    requests: collected.requests,
    stats: collected.stats,
  };
}

/** term_rescans: finished post-term re-scans, and when the current term last had no stale week */
async function recordRescans(
  db: Db,
  list: { id: string }[],
  ctx: ReturnType<typeof weekContext>,
  at: Date,
): Promise<void> {
  for (const s of list) {
    const cal = await storedPlanCalendar(db, s.id, ctx.today);
    if (!cal) continue;
    const book = termBookkeeping(await planState(db, s.id, cal), ctx);
    for (const termId of book.postTermDone) {
      await db
        .insert(termRescans)
        .values({ termId, studentId: s.id, postTermRescanDone: true })
        .onConflictDoUpdate({ target: [termRescans.termId, termRescans.studentId], set: { postTermRescanDone: true } });
    }
    if (book.currentTermId && book.currentFresh) {
      await db
        .insert(termRescans)
        .values({ termId: book.currentTermId, studentId: s.id, lastFullRescanAt: at })
        .onConflictDoUpdate({ target: [termRescans.termId, termRescans.studentId], set: { lastFullRescanAt: at } });
    }
  }
}
