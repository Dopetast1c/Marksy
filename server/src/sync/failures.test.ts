import { describe, expect, it } from 'vitest';
import { applyOutcome } from './failures';
import type { Outcome } from './failures';

const POLICY = { failuresBeforePause: 3, pauseHours: 24, pauseMaxHours: 168 };
const NOW = new Date('2025-10-15T10:00:00Z');
const hoursFrom = (h: number) => new Date(NOW.getTime() + h * 3_600_000);
const fresh = { consecutiveFailures: 0, pausedUntil: null, pauseHours: null, alertedAt: null };
const down: Outcome = {
  status: 'failed',
  errorClass: 'provider_unavailable',
  error: 'ProviderUnavailableError 503',
  manual: false,
};

describe('applyOutcome', () => {
  it('pauses after three provider failures in a row and tells the admin once', () => {
    expect(applyOutcome(fresh, down, NOW, POLICY)).toEqual({
      patch: { consecutiveFailures: 1, lastError: 'ProviderUnavailableError 503' },
      alert: null,
    });
    const third = applyOutcome({ ...fresh, consecutiveFailures: 2 }, down, NOW, POLICY);
    expect(third.patch).toMatchObject({ consecutiveFailures: 3, pauseHours: 24, pausedUntil: hoursFrom(24) });
    expect(third.alert).toBe('paused');
  });

  it('doubles the pause when the first run after it fails, up to the cap, without a second alert', () => {
    const after = { consecutiveFailures: 3, pausedUntil: new Date(NOW.getTime() - 1), pauseHours: 24, alertedAt: NOW };
    expect(applyOutcome(after, down, NOW, POLICY)).toEqual({
      patch: expect.objectContaining({ pauseHours: 48, pausedUntil: hoursFrom(48) }),
      alert: null,
    });
    expect(applyOutcome({ ...after, pauseHours: 96 }, down, NOW, POLICY).patch.pauseHours).toBe(168);
    expect(applyOutcome({ ...after, pauseHours: 168 }, down, NOW, POLICY).patch.pauseHours).toBe(168);
  });

  it('a partial run counts as one failure', () => {
    const partial: Outcome = { ...down, status: 'partial', errorClass: 'partial' };
    expect(applyOutcome(fresh, partial, NOW, POLICY).patch.consecutiveFailures).toBe(1);
  });

  it('a failed manual try during a pause leaves the pause as it was', () => {
    const paused = { consecutiveFailures: 3, pausedUntil: hoursFrom(5), pauseHours: 24, alertedAt: NOW };
    const r = applyOutcome(paused, { ...down, manual: true }, NOW, POLICY);
    expect(r.patch).toEqual({ consecutiveFailures: 4, lastError: 'ProviderUnavailableError 503' });
  });

  it('one success resets the counter and the pause length', () => {
    const paused = { consecutiveFailures: 5, pausedUntil: hoursFrom(-1), pauseHours: 96, alertedAt: NOW };
    const ok = applyOutcome(paused, { status: 'success', errorClass: null, error: null, manual: false }, NOW, POLICY);
    expect(ok.patch).toMatchObject({
      consecutiveFailures: 0,
      pausedUntil: null,
      pauseHours: null,
      lastSuccessAt: NOW,
      alertedAt: null,
    });
  });

  it('a rejected login stops the account until the credentials change', () => {
    const r = applyOutcome(
      fresh,
      { status: 'failed', errorClass: 'auth', error: 'ProviderAuthError', manual: false },
      NOW,
      POLICY,
    );
    expect(r).toEqual({
      patch: expect.objectContaining({ status: 'auth_failed', requiresAction: 'auth', pausedUntil: null }),
      alert: 'auth',
    });
  });

  it('our own bugs never count against the diary', () => {
    const r = applyOutcome(
      fresh,
      { status: 'failed', errorClass: null, error: 'DatabaseError', manual: false },
      NOW,
      POLICY,
    );
    expect(r).toEqual({ patch: { lastError: 'DatabaseError' }, alert: null });
  });
});
