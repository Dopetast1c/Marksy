import { and, eq, gt } from 'drizzle-orm';
import type { Db } from '../db/client';
import { instanceState, syncRuns } from '../db/schema';

// The collector's switches beyond SYNC_ENABLED (docs/running.md): the one in the database, which a restore turns off
// so that two hosts never read a diary at once, and a short hold the updater takes so that no run starts while it
// replaces the server.

/** A run older than this with no end is one a stopped process left behind, not one in progress */
const RUN_STALE_MS = 60 * 60_000;

let holdUntil = 0;

/** No run starts until then (the updater, before an update); a later call moves it, 0 ends it */
export function holdSync(untilMs: number): void {
  holdUntil = untilMs;
}

export const syncHeldUntil = (nowMs = Date.now()) => (holdUntil > nowMs ? holdUntil : null);

/** The database's switch: false after a restore until `marksy sync enable` */
export async function syncEnabledHere(db: Db): Promise<boolean> {
  const [row] = await db.select({ on: instanceState.syncEnabled }).from(instanceState).where(eq(instanceState.id, 1));
  return row?.on ?? true;
}

export async function setSyncEnabled(db: Db, on: boolean, note: string): Promise<void> {
  await db
    .insert(instanceState)
    .values({ id: 1, syncEnabled: on, syncNote: note, updatedAt: new Date() })
    .onConflictDoUpdate({ target: instanceState.id, set: { syncEnabled: on, syncNote: note, updatedAt: new Date() } });
}

/** Whether a run may start now: neither switched off in the database nor held by the updater */
export async function mayStartRun(db: Db, now = new Date()): Promise<boolean> {
  return syncHeldUntil(now.getTime()) === null && (await syncEnabledHere(db));
}

/** Runs in progress in any process on this database (a crashed one's row stops counting after an hour) */
export async function runsInProgress(db: Db, now = new Date()): Promise<number> {
  const rows = await db
    .select({ id: syncRuns.id })
    .from(syncRuns)
    .where(and(eq(syncRuns.status, 'running'), gt(syncRuns.startedAt, new Date(now.getTime() - RUN_STALE_MS))));
  return rows.length;
}
