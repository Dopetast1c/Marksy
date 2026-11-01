// Which backups to keep (docs/running.md, backups). Daily ones rotate grandfather-father-son: the newest of each of the
// last 7 days with a backup, of each of the last 4 weeks and of each of the last 6 months. Backups taken before an
// update are kept apart, the last 10 of them, so several updates on one day never push out the daily history.

export interface Dated {
  name: string;
  at: Date;
}

export const ROTATION = { daily: 7, weekly: 4, monthly: 6, preUpdate: 10 } as const;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: Date) => d.toISOString().slice(0, 7);
/** ISO week: the Monday it starts on, in UTC */
function weekKey(d: Date): string {
  const day = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const offset = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - offset);
  return dayKey(day);
}

/** The newest file of each of the `count` most recent periods */
function newestPer(sorted: Dated[], key: (d: Date) => string, count: number): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const f of sorted) {
    const k = key(f.at);
    if (seen.has(k)) continue;
    seen.add(k);
    kept.push(f.name);
    if (seen.size === count) break;
  }
  return kept;
}

/** The daily backups to keep; every other one may go */
export function keepDaily(files: Dated[], limits: { daily: number; weekly: number; monthly: number } = ROTATION) {
  const sorted = [...files].sort((a, b) => b.at.getTime() - a.at.getTime());
  return new Set([
    ...newestPer(sorted, dayKey, limits.daily),
    ...newestPer(sorted, weekKey, limits.weekly),
    ...newestPer(sorted, monthKey, limits.monthly),
  ]);
}

/** The backups before updates to keep: the newest ones */
export function keepNewest(files: Dated[], count: number = ROTATION.preUpdate) {
  return new Set(
    [...files]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, count)
      .map((f) => f.name),
  );
}
