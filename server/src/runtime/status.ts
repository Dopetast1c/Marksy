import { desc, eq, max } from 'drizzle-orm';
import type { Db } from '../db/client';
import { backupRuns, diaryAccounts } from '../db/schema';
import { jobsStatus } from '../jobs/runner';
import { runsInProgress, syncEnabledHere, syncHeldUntil } from './instance';
import { appVersion } from './version';
import type { AppVersion } from './version';

// What the instance reports about itself to the status command and the updater (docs/running.md, "Status"): versions,
// times and counts only, never a name, a login or a path on the host.

export interface InstanceStatus extends AppVersion {
  migrations: number;
  sync: {
    /** SYNC_ENABLED and the database's switch together */
    enabled: boolean;
    switchedOffHere: boolean;
    heldUntil: string | null;
    running: number;
    lastSuccessAt: string | null;
  };
  backup: { lastSuccessAt: string | null; lastFile: string | null; lastFailureAt: string | null };
  /** background jobs that are not done, and the ones finished in the last day */
  jobs: Awaited<ReturnType<typeof jobsStatus>>;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function instanceStatus(db: Db, opts: { syncEnv: boolean; now?: Date }): Promise<InstanceStatus> {
  const now = opts.now ?? new Date();
  const here = await syncEnabledHere(db);
  const held = syncHeldUntil(now.getTime());
  const [{ last } = { last: null }] = await db.select({ last: max(diaryAccounts.lastSuccessAt) }).from(diaryAccounts);
  const [ok] = await db
    .select()
    .from(backupRuns)
    .where(eq(backupRuns.status, 'success'))
    .orderBy(desc(backupRuns.startedAt))
    .limit(1);
  const [failed] = await db
    .select()
    .from(backupRuns)
    .where(eq(backupRuns.status, 'failed'))
    .orderBy(desc(backupRuns.startedAt))
    .limit(1);
  const { rows } = await db.$client.query<{ n: string }>('select count(*) as n from drizzle.__drizzle_migrations');
  return {
    ...appVersion(),
    migrations: Number(rows[0]?.n ?? 0),
    sync: {
      enabled: opts.syncEnv && here,
      switchedOffHere: !here,
      heldUntil: held ? new Date(held).toISOString() : null,
      running: await runsInProgress(db, now),
      lastSuccessAt: iso(last),
    },
    backup: {
      lastSuccessAt: iso(ok?.finishedAt ?? ok?.startedAt),
      lastFile: ok?.file ?? null,
      lastFailureAt: iso(failed && (!ok || failed.startedAt > ok.startedAt) ? failed.startedAt : null),
    },
    jobs: await jobsStatus(db, now),
  };
}
