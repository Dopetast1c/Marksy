import { describe, expect, it } from 'vitest';
import { freshnessOf } from './freshness';
import type { SyncStatus } from './freshness';

const now = Date.parse('2026-10-19T12:00:00Z');
const account = (status: string, lastSuccessAt: string) =>
  ({
    id: 'acc',
    providerId: 'demo-full',
    providerName: 'Demo',
    status,
    lastSuccessAt,
    lastAttemptAt: lastSuccessAt,
    lastRun: null,
    consecutiveFailures: 0,
    pausedUntil: null,
    nextAllowedAt: null,
    studentIds: ['kid'],
  }) as unknown as SyncStatus['accounts'][number];
const status = (s: string, at: string): SyncStatus => ({
  accounts: [account(s, at)],
  students: [
    { id: 'kid', readThrough: 'own', lastSuccessAt: at as unknown as SyncStatus['students'][number]['lastSuccessAt'] },
  ],
});

describe('the freshness banner', () => {
  it('says nothing while the data is fresh', () => {
    expect(freshnessOf(status('ok', '2026-10-19T09:00:00Z'), 'kid', now)).toBeNull();
  });

  it('data older than a day, a pause, a refused login, the first load', () => {
    expect(freshnessOf(status('ok', '2026-10-17T09:00:00Z'), 'kid', now)?.kind).toBe('stale');
    expect(freshnessOf(status('paused', '2026-10-19T09:00:00Z'), 'kid', now)?.kind).toBe('paused');
    for (const s of ['auth_failed', 'blocked', 'needs_2fa'])
      expect(freshnessOf(status(s, '2026-10-19T09:00:00Z'), 'kid', now)?.kind).toBe('refused');
    expect(freshnessOf(status('loading', '2026-10-19T09:00:00Z'), 'kid', now)?.kind).toBe('loading');
  });
});
