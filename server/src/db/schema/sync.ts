import { boolean, index, integer, jsonb, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { day, id, ts } from './columns';
import { diaryAccounts, families, students } from './family';
import { terms } from './school';

// The planner's state (docs/design.md 10.4): every attempt is a sync_runs row, every verified week a sync_coverage
// row. The planner reads these and nothing else to decide what to fetch, so an outage needs no special code path.

export type SyncRunKind =
  | 'scheduled'
  | 'catchup'
  | 'manual'
  | 'rescan'
  | 'backfill'
  | 'connect'
  /** a login only to confirm with getAccount() that an account still shows its children (design.md 10.4) */
  | 'source_check';
export type SyncRunStatus =
  'running' | 'success' | 'partial' | 'failed' | 'skipped_offline' | 'skipped_paused' | 'skipped_interval';
export type SyncErrorClass = 'offline' | 'provider_unavailable' | 'auth' | 'blocked' | 'needs_2fa' | 'partial';

export interface SyncRunStats {
  weeks_verified?: number;
  new?: number;
  changed?: number;
  removed?: number;
  restored?: number;
  lessons?: number;
  drift?: number;
  warnings?: string[];
}

export interface SyncRunScope {
  student_ids?: string[];
  /** Planned weeks per student: week_start dates */
  weeks?: Record<string, string[]>;
  sets?: Record<string, number>;
}

export const syncRuns = pgTable(
  'sync_runs',
  {
    id: id(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    diaryAccountId: uuid('diary_account_id')
      .notNull()
      .references(() => diaryAccounts.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    kind: text('kind').$type<SyncRunKind>().notNull(),
    scope: jsonb('scope').$type<SyncRunScope>().notNull().default({}),
    /** schedule | startup | cli | cli-claude | user:<id> */
    trigger: text('trigger').notNull(),
    startedAt: ts('started_at').notNull(),
    finishedAt: ts('finished_at'),
    status: text('status').$type<SyncRunStatus>().notNull(),
    errorClass: text('error_class').$type<SyncErrorClass>(),
    /** Sanitised: an error class and a short reason, never a body, a name or a token */
    error: text('error'),
    requests: integer('requests').notNull().default(0),
    durationMs: integer('duration_ms'),
    stats: jsonb('stats').$type<SyncRunStats>().notNull().default({}),
  },
  (t) => [
    index('sync_runs_account_started_idx').on(t.diaryAccountId, t.startedAt),
    index('sync_runs_started_idx').on(t.startedAt),
  ],
);

export const syncCoverage = pgTable(
  'sync_coverage',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    weekStart: day('week_start').notNull(),
    verifiedAt: ts('verified_at').notNull(),
    runId: uuid('run_id').references(() => syncRuns.id, { onDelete: 'set null' }),
    status: text('status', { enum: ['verified', 'failed'] }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.weekStart] })],
);

export const termRescans = pgTable(
  'term_rescans',
  {
    termId: uuid('term_id')
      .notNull()
      .references(() => terms.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    lastFullRescanAt: ts('last_full_rescan_at'),
    postTermRescanDone: boolean('post_term_rescan_done').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.termId, t.studentId] })],
);

/** sync_runs older than the retention limit, compacted to one line per account and day */
export const syncDaily = pgTable(
  'sync_daily',
  {
    diaryAccountId: uuid('diary_account_id')
      .notNull()
      .references(() => diaryAccounts.id, { onDelete: 'cascade' }),
    date: day('date').notNull(),
    runs: integer('runs').notNull(),
    failures: integer('failures').notNull(),
    requests: integer('requests').notNull(),
  },
  (t) => [primaryKey({ columns: [t.diaryAccountId, t.date] })],
);

/**
 * Real logins started from the command line (`pnpm probe`, `pnpm sync:once`; CLAUDE.md "Real diary runs"), checked by
 * the login guard: the login interval for everyone, and Claude Code's daily cap and hours. The login itself is never
 * stored, only a hash, so a probe without a diary account yet still counts. 90 days.
 */
export const cliLogins = pgTable(
  'cli_logins',
  {
    id: id(),
    providerId: text('provider_id').notNull(),
    diaryAccountId: uuid('diary_account_id').references(() => diaryAccounts.id, { onDelete: 'set null' }),
    /** sha256 of the lower-cased login */
    loginHash: text('login_hash').notNull(),
    command: text('command').$type<'probe' | 'sync:once' | 'dev:connect'>().notNull(),
    runner: text('runner').$type<'owner' | 'claude'>().notNull(),
    at: ts('at').notNull(),
    /** Set when the diary refused this login: Claude Code's next run waits for the owner (login-guard.ts) */
    outcome: text('outcome', { enum: ['auth', 'blocked', 'needs_2fa'] }),
  },
  (t) => [index('cli_logins_login_at_idx').on(t.providerId, t.loginHash, t.at)],
);

/**
 * Response bodies of read requests, for re-parsing after a drift fix. Login responses are never stored (they carry the
 * token). Personal data: kept in the local database only, 14 days, never logged or exported to fixtures directly.
 */
export const rawResponses = pgTable(
  'raw_responses',
  {
    id: id(),
    syncRunId: uuid('sync_run_id')
      .notNull()
      .references(() => syncRuns.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    /** The allow-list entry the request matched, so ids in the path never land here */
    endpoint: text('endpoint').notNull(),
    params: jsonb('params').$type<Record<string, string>>().notNull().default({}),
    status: integer('status').notNull(),
    body: jsonb('body'),
    /** The student and week the collector was fetching when the response came, for the per-week keep rule */
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    weekStart: day('week_start'),
    fetchedAt: ts('fetched_at').notNull(),
  },
  (t) => [
    index('raw_responses_fetched_idx').on(t.fetchedAt),
    index('raw_responses_student_week_idx').on(t.studentId, t.weekStart),
  ],
);

export const apiDriftEvents = pgTable(
  'api_drift_events',
  {
    id: id(),
    syncRunId: uuid('sync_run_id').references(() => syncRuns.id, { onDelete: 'set null' }),
    providerId: text('provider_id').notNull(),
    endpoint: text('endpoint').notNull(),
    kind: text('kind').notNull(),
    path: text('path').notNull(),
    sample: jsonb('sample').$type<string | null>(),
    firstSeenAt: ts('first_seen_at').notNull(),
    lastSeenAt: ts('last_seen_at').notNull(),
    count: integer('count').notNull().default(1),
    acknowledgedAt: ts('acknowledged_at'),
  },
  (t) => [unique('api_drift_events_key').on(t.providerId, t.endpoint, t.kind, t.path)],
);
