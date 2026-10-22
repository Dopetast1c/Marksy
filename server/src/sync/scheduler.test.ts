import { describe, expect, it } from 'vitest';
import { getProvider } from '@marksy/registry';
import { resetDb, testDb } from '../../test/db';
import { createAccount } from '../../test/factories';
import { families, syncRuns } from '../db/schema';
import { effectiveLimits, parseDuration, readSyncConfig } from './config';
import { createScheduler } from './scheduler';

const db = testDb();
const silent = { debug() {}, info() {}, warn() {}, error() {} };

describe('sync config', () => {
  it('reads durations and defaults', () => {
    expect(parseDuration('24h')).toBe(86_400_000);
    expect(parseDuration('90m')).toBe(5_400_000);
    expect(parseDuration('45')).toBe(2_700_000);
    const c = readSyncConfig({ SYNC_ENABLED: 'false', SYNC_MIN_LOGIN_INTERVAL: '2h', SYNC_WINDOW: '09:00-12:00' });
    expect(c).toMatchObject({ enabled: false, minLoginIntervalMinutes: 120, window: '09:00-12:00', tickMinutes: 5 });
    expect(() => readSyncConfig({ SYNC_WINDOW: '9-12' })).toThrow(/SYNC_WINDOW/);
  });

  it('the environment and the family only make the manifest stricter', () => {
    const manifest = getProvider('demo-full')!.manifest;
    const loose = readSyncConfig({ SYNC_MIN_LOGIN_INTERVAL: '10m', SYNC_MAX_REQUESTS_PER_RUN: '500' });
    expect(effectiveLimits(manifest, loose, {})).toMatchObject({ minLoginIntervalMinutes: 60, maxRequestsPerRun: 40 });
    const strict = readSyncConfig({ SYNC_MIN_LOGIN_INTERVAL: '3h', SYNC_MAX_REQUESTS_PER_RUN: '20' });
    expect(effectiveLimits(manifest, strict, { sync_window: '10:00-18:00' })).toMatchObject({
      minLoginIntervalMinutes: 180,
      maxRequestsPerRun: 20,
      window: [600, 840],
    });
  });
});

describe('scheduler', () => {
  it('skips families without a diary account and accounts that need action', async () => {
    await resetDb(db);
    await db.insert(families).values({ name: 'Demo family without a diary' });
    await createAccount(db, 'demo-full', { requiresAction: 'auth', status: 'auth_failed' });
    let after = 0;
    const s = createScheduler({ db, config: readSyncConfig({}), log: silent, afterTick: async () => void after++ });
    try {
      await s.tick('schedule');
    } finally {
      s.stop();
    }
    expect(await db.select().from(syncRuns)).toEqual([]);
    expect(after).toBe(1);
  });
});
