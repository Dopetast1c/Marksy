import { bigint, check, index, pgTable, smallint, text, boolean } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { createdAt, id, ts } from './columns';

// How this instance runs (docs/running.md): one row of switches that travel with the data, and the backups taken.

/**
 * One row. sync_enabled is the collector's switch that goes with the database, next to SYNC_ENABLED in the environment:
 * a restore always turns it off (two hosts never read a diary at once), `marksy sync enable` turns it on again.
 */
export const instanceState = pgTable(
  'instance_state',
  {
    id: smallint('id').primaryKey().default(1),
    syncEnabled: boolean('sync_enabled').notNull().default(true),
    /** Why it was switched, in English, for the status command: "restored from <file>" */
    syncNote: text('sync_note'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [check('instance_state_one_row', sql`${t.id} = 1`)],
);

export type BackupKind = 'daily' | 'manual' | 'pre-update';

/** Every backup the backup service took or failed to take (180 days, retention.ts): the status command reads it */
export const backupRuns = pgTable(
  'backup_runs',
  {
    id: id(),
    kind: text('kind').$type<BackupKind>().notNull(),
    /** The file name under BACKUP_DIR, never a full host path */
    file: text('file'),
    /** The running version when it was taken; an update's backup also names the version it leads to */
    version: text('version').notNull(),
    toVersion: text('to_version'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    status: text('status', { enum: ['success', 'failed'] }).notNull(),
    /** A short English reason, never a path or a value from the data */
    error: text('error'),
    startedAt: ts('started_at').notNull(),
    finishedAt: ts('finished_at'),
    createdAt: createdAt(),
  },
  (t) => [index('backup_runs_started_idx').on(t.startedAt)],
);
