import type { Schemas } from '../api/client';

// The FreshnessBanner (ux-principles D22): nothing while data is fresh; one line on every student screen when a school
// day of the child passed unread, syncing is paused, the first load is still running or the diary refused the login.
// The account is the one that reads the child now (sync status lists only those children under it).

export type SyncStatus = Schemas['SyncStatus'];
/** unreachable: the server does not answer (restarting for an update, or the host is off); the data on screen stays */
export type Freshness = { kind: 'loading' | 'stale' | 'paused' | 'refused' | 'unreachable'; since: string | null };

const DAY_MS = 24 * 60 * 60 * 1000;

export function freshnessOf(status: SyncStatus | undefined, studentId: string, now = Date.now()): Freshness | null {
  if (!status) return null;
  const child = status.students.find((s) => s.id === studentId);
  const account = status.accounts.find((a) => a.studentIds.includes(studentId));
  const since = (child?.lastSuccessAt ?? account?.lastSuccessAt ?? null) as string | null;
  switch (account?.status) {
    case 'auth_failed':
    case 'blocked':
    case 'needs_2fa':
      return { kind: 'refused', since };
    case 'paused':
      return { kind: 'paused', since };
    case 'loading':
      return { kind: 'loading', since };
  }
  // "stale" is the server's: a school day of the child passed unread (D55), so a Monday morning is not an alarm
  if (child ? child.stale : since != null && now - Date.parse(since) > DAY_MS) return { kind: 'stale', since };
  return null;
}
