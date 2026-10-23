import { demoFullTransport } from '@marksy/registry';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { createAccount, TEST_CREDENTIALS_KEY } from '../../test/factories';
import { diaryAccounts, memberships, notifications, syncCoverage, syncRuns, users } from '../db/schema';
import { readSyncConfig } from './config';
import type { SyncConfig } from './config';
import { runSync } from './run';
import type { RunSyncOptions } from './run';
import type { Trigger } from './plan';

const db = testDb();
/** A moment in school-local time (demo-full: Europe/Minsk, UTC+3) */
const at = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:00`);
const unavailable = async () => ({ status: 503, headers: {}, text: '' });

async function setup() {
  const { family, account } = await createAccount(db, 'demo-full');
  const [admin] = await db
    .insert(users)
    .values({ login: 'admin@example.com', displayName: 'Admin', passwordHash: 'x' })
    .returning();
  await db.insert(memberships).values({ userId: admin!.id, familyId: family.id, role: 'admin' });
  return account;
}

function sync(
  accountId: string,
  nowLocal: string,
  over: Omit<Partial<RunSyncOptions>, 'config'> & { config?: Partial<SyncConfig> } = {},
) {
  const { config, ...rest } = over;
  return runSync({
    db,
    accountId,
    trigger: 'schedule' as Trigger,
    config: { ...readSyncConfig({}), ...config },
    now: () => at(nowLocal),
    transport: demoFullTransport(),
    sleep: async () => undefined,
    online: async () => true,
    credentialsKey: TEST_CREDENTIALS_KEY,
    ...rest,
  });
}

const account = async (id: string) => (await db.select().from(diaryAccounts).where(eq(diaryAccounts.id, id)))[0]!;
const runs = () => db.select().from(syncRuns).orderBy(syncRuns.startedAt);

describe('runSync', () => {
  beforeEach(() => resetDb(db));

  it('a new account backfills at once and records the run', async () => {
    const a = await setup();
    const r = await sync(a.id, '2025-09-17 22:00');
    expect(r).toMatchObject({ outcome: 'ran', status: 'success' });
    const [run] = await runs();
    expect(run).toMatchObject({ kind: 'backfill', trigger: 'schedule', status: 'success' });
    expect(run!.scope.sets).toMatchObject({ standing: 4, backfill: 2 });
    expect(await account(a.id)).toMatchObject({ lastSuccessAt: at('2025-09-17 22:00'), consecutiveFailures: 0 });
  });

  it('never logs in twice within the interval; a manual try leaves a skipped row', async () => {
    const a = await setup();
    await sync(a.id, '2025-09-17 10:00');
    expect(await sync(a.id, '2025-09-17 10:30')).toMatchObject({
      outcome: 'skipped',
      decision: { reason: 'interval' },
    });
    expect(await runs()).toHaveLength(1);
    const manual = await sync(a.id, '2025-09-17 10:30', { trigger: 'user:someone' });
    expect(manual).toMatchObject({ outcome: 'skipped', runId: expect.any(String) });
    expect((await runs()).map((r) => r.status)).toEqual(['success', 'skipped_interval']);
  });

  it('offline: recorded, nothing counted, no login', async () => {
    const a = await setup();
    const r = await sync(a.id, '2025-09-17 10:00', { online: async () => false });
    expect(r.outcome).toBe('offline');
    expect(await account(a.id)).toMatchObject({ lastAttemptAt: null, consecutiveFailures: 0, pausedUntil: null });
    expect((await runs())[0]).toMatchObject({ status: 'skipped_offline', errorClass: 'offline' });
    // and the next check waits for the retry interval
    expect(await sync(a.id, '2025-09-17 10:05')).toMatchObject({ decision: { reason: 'offline_retry' } });
  });

  it('pauses after three failures, tells the admin once, doubles the pause after it', async () => {
    const a = await setup();
    await sync(a.id, '2025-09-17 08:30'); // a first success, so later runs are ordinary
    const fail = { transport: unavailable };
    for (const t of ['2025-09-17 09:55', '2025-09-17 11:20', '2025-09-17 12:45']) {
      expect(await sync(a.id, t, fail)).toMatchObject({
        outcome: 'ran',
        status: 'failed',
        errorClass: 'provider_unavailable',
      });
    }
    expect(await account(a.id)).toMatchObject({
      consecutiveFailures: 3,
      pauseHours: 24,
      pausedUntil: at('2025-09-18 12:45'),
    });
    const notes = await db.select().from(notifications);
    expect(notes).toEqual([
      expect.objectContaining({
        title: 'notification.syncPaused.title',
        params: { until: at('2025-09-18 12:45').toISOString() },
      }),
    ]);

    expect(await sync(a.id, '2025-09-18 10:00', fail)).toMatchObject({ decision: { reason: 'paused' } });
    // the first run after the pause fails again: 48 hours, and no second notice
    await sync(a.id, '2025-09-18 12:50', fail);
    expect(await account(a.id)).toMatchObject({ pauseHours: 48, pausedUntil: at('2025-09-20 12:50') });
    expect(await db.select().from(notifications)).toHaveLength(1);
    // one success resets everything
    await sync(a.id, '2025-09-20 13:00');
    expect(await account(a.id)).toMatchObject({ consecutiveFailures: 0, pausedUntil: null, pauseHours: null });
  });

  it('a refused login stops the account until the credentials change; never retried', async () => {
    const a = await setup();
    const r = await sync(a.id, '2025-09-17 10:00', {
      transport: async () => ({ status: 401, headers: {}, text: '{}' }),
    });
    expect(r).toMatchObject({ status: 'failed', errorClass: 'auth' });
    expect(await account(a.id)).toMatchObject({ status: 'auth_failed', requiresAction: 'auth' });
    expect((await db.select().from(notifications))[0]).toMatchObject({ title: 'notification.syncAuth.title' });
    expect(await sync(a.id, '2025-09-18 10:00', { trigger: 'cli' })).toMatchObject({
      decision: { reason: 'requires_action' },
    });
  });

  it('catches up a long backlog over several runs, freshest weeks first', async () => {
    const a = await setup();
    const cap = { config: { maxRequestsPerRun: 12 } };
    // login, profile, year and subjects per pupil = 6; 4 standing weeks; 2 finals
    await sync(a.id, '2025-10-15 15:00', cap);
    const weeks = async () => (await db.select().from(syncCoverage)).map((c) => c.weekStart);
    expect(new Set(await weeks())).toEqual(new Set(['2025-10-13', '2025-10-06']));
    // an hour later, outside the window: a catch-up takes the newest missing weeks
    expect(await sync(a.id, '2025-10-15 16:01', cap)).toMatchObject({ status: 'success' });
    expect((await runs())[1]!.kind).toBe('catchup');
    const after2 = new Set(await weeks());
    expect(after2.has('2025-09-29')).toBe(true);
    expect(after2.has('2025-09-01')).toBe(false);
    // every run takes the standing weeks again, so 6 requests leave room for 2 older weeks per run
    for (const t of ['2025-10-15 17:02', '2025-10-15 18:03', '2025-10-15 19:04', '2025-10-15 20:05'])
      await sync(a.id, t, cap);
    expect(new Set(await weeks()).size).toBe(7);
    // nothing left: the next evening tick does nothing
    expect(await sync(a.id, '2025-10-15 21:06', cap)).toMatchObject({ decision: { reason: 'outside_window' } });
  });

  it('two ticks never run one account at once', async () => {
    const a = await setup();
    const [x, y] = await Promise.all([sync(a.id, '2025-09-17 10:00'), sync(a.id, '2025-09-17 10:00')]);
    expect([x.outcome, y.outcome].sort()).toEqual(['locked', 'ran']);
  });
});
