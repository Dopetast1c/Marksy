import type { Schemas } from '../api/client';

// The FreshnessBanner (ux-principles D22): nothing while data is fresh; one line on every student screen when the
// child's data is older than a day, syncing is paused, the first load is still running or the diary refused the login.

export type SyncStatus = Schemas['SyncStatus'];
export type Freshness = { kind: 'loading' | 'stale' | 'paused' | 'refused'; since: string | null };

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
  if (since && now - Date.parse(since) > DAY_MS) return { kind: 'stale', since };
  return null;
}
