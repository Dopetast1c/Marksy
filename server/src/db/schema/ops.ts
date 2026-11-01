import { bigint, check, index, integer, jsonb, pgTable, smallint, text, boolean } from 'drizzle-orm/pg-core';
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

/**
 * A long change to existing data that runs after the server answers instead of inside a migration (CLAUDE.md,
 * "Migrations"; server/src/jobs/runner.ts): one row per job, named in code, with the cursor it resumes from after a
 * restart and its progress for the status command. Finished jobs go after 180 days (retention.ts).
 */
export const backgroundJobs = pgTable('background_jobs', {
  id: text('id').primaryKey(),
  status: text('status', { enum: ['pending', 'running', 'done', 'failed'] })
    .notNull()
    .default('pending'),
  /** where the next step starts; written in the same transaction as the step's changes */
  cursor: jsonb('cursor'),
  done: integer('done').notNull().default(0),
  total: integer('total'),
  attempts: integer('attempts').notNull().default(0),
  /** A short English reason, never a value from the data */
  error: text('error'),
  startedAt: ts('started_at'),
  updatedAt: ts('updated_at').notNull().defaultNow(),
  finishedAt: ts('finished_at'),
});
