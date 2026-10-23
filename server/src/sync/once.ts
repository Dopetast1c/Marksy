import type { DiaryProvider } from '@marksy/core';
import { and, eq, sql } from 'drizzle-orm';
import { apiDriftEvents, diaryAccounts, families, studentSources } from '../db/schema';
import { decryptCredentials, encryptCredentials } from '../crypto/credentials';
import { runSync } from './run';
import type { RunSyncOptions, RunSyncResult } from './run';

// `pnpm sync:once` (docs/build-plan.md M3): one collector run for the owner's own diary login from .env, so the schema
// and the mapper meet real data early. It finds or creates a minimal family with one diary account (M4's
// `pnpm dev:connect` adopts it) and goes through the same gate as every other run: login interval, pause, offline
// check. Output is counts, statuses and drift shapes only: never names, marks or texts.

export interface SyncOnceOptions extends Omit<RunSyncOptions, 'accountId' | 'trigger' | 'provider'> {
  provider: DiaryProvider;
  /** cli-claude when Claude Code runs it (MARKSY_RUNNER=claude) */
  trigger?: 'cli' | 'cli-claude';
  login: string;
  password: string;
  credentialsKey: Buffer;
}

export interface SyncOnceReport {
  created: boolean;
  credentialsChanged: boolean;
  result: RunSyncResult;
  students: number;
  drift: { endpoint: string; kind: string; path: string; count: number }[];
}

export async function syncOnce(opts: SyncOnceOptions): Promise<SyncOnceReport> {
  const { db, provider, login, password, credentialsKey } = opts;
  const providerId = provider.manifest.id;
  const credentials = { login, password };

  let [account] = await db
    .select()
    .from(diaryAccounts)
    .where(and(eq(diaryAccounts.providerId, providerId), sql`lower(${diaryAccounts.label}) = lower(${login})`));
  let created = false;
  let credentialsChanged = false;
  if (!account) {
    const [family] = await db.insert(families).values({ name: 'Family' }).returning();
    [account] = await db
      .insert(diaryAccounts)
      .values({
        familyId: family!.id,
        providerId,
        role: 'parent',
        label: login,
        credentialsEnc: encryptCredentials(credentials, family!.id, credentialsKey),
      })
      .returning();
    created = true;
  } else {
    let same: boolean;
    try {
      const old =
        account.credentialsEnc && decryptCredentials(account.credentialsEnc, account.familyId, credentialsKey);
      same = !!old && old.login === login && old.password === password;
    } catch {
      // stored under another CREDENTIALS_KEY: replaced
      same = false;
    }
    if (!same) {
      // a changed credentials row is what lets an account that needed action try again (docs/design.md 10.4)
      await db
        .update(diaryAccounts)
        .set({
          credentialsEnc: encryptCredentials(credentials, account.familyId, credentialsKey),
          status: 'ok',
          requiresAction: null,
          alertedAt: null,
        })
        .where(eq(diaryAccounts.id, account.id));
      credentialsChanged = true;
    }
  }

  const result = await runSync({
    ...opts,
    accountId: account!.id,
    trigger: opts.trigger ?? 'cli',
    provider: (id) => (id === providerId ? provider : undefined),
  });
  const [count] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(studentSources)
    .where(eq(studentSources.diaryAccountId, account!.id));
  const drift =
    'runId' in result && result.runId
      ? await db
          .select({
            endpoint: apiDriftEvents.endpoint,
            kind: apiDriftEvents.kind,
            path: apiDriftEvents.path,
            count: apiDriftEvents.count,
          })
          .from(apiDriftEvents)
          .where(eq(apiDriftEvents.syncRunId, result.runId))
      : [];
  return { created, credentialsChanged, result, students: count?.n ?? 0, drift };
}

/**
 * 0 when everything went as the rules say, including a run the gate held back (login interval, pause, offline,
 * another run in progress); 1 only for a real failure: the diary refused or failed, our own error, or an account
 * that needs new credentials.
 */
export function exitCodeOf(r: SyncOnceReport): 0 | 1 {
  const res = r.result;
  switch (res.outcome) {
    case 'ran':
      return res.status === 'success' ? 0 : 1;
    case 'skipped':
      return res.decision.reason === 'requires_action' ? 1 : 0;
    case 'offline':
    case 'locked':
      return 0;
    case 'unknown_account':
      return 1;
  }
}

/** The report as lines for the terminal: counts and statuses only */
export function formatReport(r: SyncOnceReport): string[] {
  const lines = [
    r.created ? 'family and diary account created' : 'existing diary account',
    ...(r.credentialsChanged ? ['credentials updated'] : []),
  ];
  const res = r.result;
  switch (res.outcome) {
    case 'ran':
      lines.push(
        `run: ${res.status}${res.errorClass ? ` (${res.errorClass})` : ''}, ${res.requests} requests`,
        `students: ${r.students}`,
        `weeks verified: ${res.stats.weeks_verified ?? 0}, lessons: ${res.stats.lessons ?? 0}`,
        `marks: ${res.stats.new ?? 0} new, ${res.stats.changed ?? 0} changed, ${res.stats.removed ?? 0} removed`,
        r.drift.length ? `drift: ${r.drift.length} kinds` : 'drift: none',
        ...r.drift.map((d) => `  ${d.kind} ${d.endpoint} ${d.path} (${d.count}x)`),
      );
      break;
    case 'skipped':
      lines.push(
        `not run: ${res.decision.reason}${res.decision.retryAt ? `, next allowed at ${res.decision.retryAt.toISOString()}` : ''}`,
      );
      break;
    case 'offline':
      lines.push('not run: this computer cannot reach the diary host (offline or DNS); nothing was counted');
      break;
    case 'locked':
      lines.push('not run: another sync of this account is running (is pnpm dev running?)');
      break;
    case 'unknown_account':
      lines.push('not run: unknown provider');
      break;
  }
  return lines;
}
