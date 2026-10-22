import type { diaryAccounts, SyncErrorClass } from '../db/schema';

// What a finished run does to its diary account (docs/design.md 10.4, "Failure classes"): a success resets the
// counter and the pause; a provider failure counts, pauses after N in a row and doubles the pause when the first run
// after it fails again; auth, blocked and needs_2fa stop the account until the credentials change.

type AccountRow = typeof diaryAccounts.$inferSelect;
export type AccountPatch = Partial<typeof diaryAccounts.$inferInsert>;

export interface FailurePolicy {
  failuresBeforePause: number;
  pauseHours: number;
  pauseMaxHours: number;
}

export type Alert = 'paused' | 'auth' | 'blocked' | 'needs_2fa';

export interface Outcome {
  status: 'success' | 'partial' | 'failed';
  errorClass: SyncErrorClass | null;
  error: string | null;
  manual: boolean;
}

const HOUR = 3_600_000;

export function applyOutcome(
  account: Pick<AccountRow, 'consecutiveFailures' | 'pausedUntil' | 'pauseHours' | 'alertedAt'>,
  outcome: Outcome,
  now: Date,
  policy: FailurePolicy,
): { patch: AccountPatch; alert: Alert | null } {
  if (outcome.status === 'success') {
    return {
      patch: {
        status: 'ok',
        consecutiveFailures: 0,
        pausedUntil: null,
        pauseHours: null,
        requiresAction: null,
        lastSuccessAt: now,
        lastOkAt: now,
        lastError: null,
        alertedAt: null,
      },
      alert: null,
    };
  }

  const cls = outcome.errorClass;
  if (cls === 'auth' || cls === 'blocked' || cls === 'needs_2fa') {
    const status = cls === 'auth' ? 'auth_failed' : cls;
    return {
      patch: { status, requiresAction: cls, pausedUntil: null, lastError: outcome.error, alertedAt: now },
      alert: account.alertedAt ? null : cls,
    };
  }
  // our own bug (a policy refusal, a database error): logged on the run, never held against the diary
  if (cls === null) return { patch: { lastError: outcome.error }, alert: null };

  const failures = account.consecutiveFailures + 1;
  const patch: AccountPatch = { consecutiveFailures: failures, lastError: outcome.error };
  // the button during a pause: one try, and if it fails the pause stays as it was
  if (outcome.manual && account.pausedUntil && now < account.pausedUntil) return { patch, alert: null };

  let hours: number | null = null;
  if (account.pausedUntil && account.pauseHours) {
    // the first run after a pause failed again
    hours = Math.min(account.pauseHours * 2, policy.pauseMaxHours);
  } else if (failures >= policy.failuresBeforePause) {
    hours = Math.min(policy.pauseHours, policy.pauseMaxHours);
  }
  if (hours === null) return { patch, alert: null };
  return {
    patch: { ...patch, pauseHours: hours, pausedUntil: new Date(now.getTime() + hours * HOUR), alertedAt: now },
    alert: account.alertedAt ? null : 'paused',
  };
}
