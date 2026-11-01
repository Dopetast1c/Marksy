import { eq, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { backgroundJobs } from '../db/schema';
import type { Logger } from '@marksy/core';
import { errorSummary } from '../log';

// Background jobs (CLAUDE.md, "Migrations"): a change to existing data that would make a migration long, and so a
// start long and an update's downtime long, runs here instead, after the server answers. A job works in small steps;
// each step's changes and the job's cursor commit in one transaction, so a job stopped anywhere (an update, a power
// cut) resumes from the last step and never does a step twice. The code must work while a job is unfinished: a
// release that needs the job's result reads both shapes until a later release (expand, then contract).

export interface StepResult<C> {
  /** where the next step starts; null when the job is finished */
  cursor: C | null;
  /** how many items this step handled */
  done: number;
  /** how many items there are in all, when the job knows */
  total?: number;
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface BackgroundJob<C = unknown> {
  /** stable and unique: the row of background_jobs; a new job, never a renamed one */
  id: string;
  /** one bounded step from the cursor (null at the start), inside the transaction it is given */
  step(tx: Tx, cursor: C | null): Promise<StepResult<C>>;
}

/** The jobs of this release, oldest first. A job stays listed until every supported release has run it. */
export const JOBS: BackgroundJob[] = [];

/** A failed job is tried again at the next start, this many times in all */
export const MAX_ATTEMPTS = 5;

export interface RunOptions {
  log?: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** asked between steps: true stops the run (SIGTERM) */
  stopped?: () => boolean;
  /** pause between steps, so that a long job leaves room for requests */
  pauseMs?: number;
}

/** Runs every unfinished job to its end, one after another; returns the ids finished in this run */
export async function runJobs(db: Db, jobs: BackgroundJob[], opts: RunOptions = {}): Promise<string[]> {
  const finished: string[] = [];
  if (!jobs.length) return finished;
  await db
    .insert(backgroundJobs)
    .values(jobs.map((j) => ({ id: j.id })))
    .onConflictDoNothing();
  const rows = await db
    .select()
    .from(backgroundJobs)
    .where(
      inArray(
        backgroundJobs.id,
        jobs.map((j) => j.id),
      ),
    );
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const job of jobs) {
    const row = byId.get(job.id);
    if (!row || row.status === 'done') continue;
    if (row.status === 'failed' && row.attempts >= MAX_ATTEMPTS) continue;
    await db
      .update(backgroundJobs)
      .set({
        status: 'running',
        attempts: sql`${backgroundJobs.attempts} + 1`,
        error: null,
        startedAt: row.startedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(backgroundJobs.id, job.id));
    opts.log?.info('background job', { kind: job.id, count: row.done });
    try {
      for (;;) {
        if (opts.stopped?.()) return finished;
        const end = await db.transaction(async (tx) => {
          // the row is the lock: a second runner skips a job this one holds
          const [current] = await tx
            .select()
            .from(backgroundJobs)
            .where(eq(backgroundJobs.id, job.id))
            .for('update', { skipLocked: true });
          if (!current) return true;
          const r = await job.step(tx, (current.cursor ?? null) as unknown);
          const done = current.done + r.done;
          await tx
            .update(backgroundJobs)
            .set({
              cursor: r.cursor as never,
              done,
              ...(r.total !== undefined && { total: r.total }),
              updatedAt: new Date(),
              ...(r.cursor === null && { status: 'done' as const, finishedAt: new Date() }),
            })
            .where(eq(backgroundJobs.id, job.id));
          return r.cursor === null;
        });
        if (end) break;
        if (opts.pauseMs) await new Promise((r) => setTimeout(r, opts.pauseMs));
      }
      finished.push(job.id);
      opts.log?.info('background job done', { kind: job.id });
    } catch (err) {
      const reason = errorSummary(err);
      await db
        .update(backgroundJobs)
        .set({ status: 'failed', error: reason, updatedAt: new Date() })
        .where(eq(backgroundJobs.id, job.id));
      opts.log?.error('background job failed', { kind: job.id, error: reason });
      // the next job may depend on this one: stop here, the next start tries again
      return finished;
    }
  }
  return finished;
}

/** What the status command shows: every job that is not done, and the ones finished in the last day */
export async function jobsStatus(db: Db, now = new Date()) {
  const rows = await db
    .select({
      id: backgroundJobs.id,
      status: backgroundJobs.status,
      done: backgroundJobs.done,
      total: backgroundJobs.total,
      finishedAt: backgroundJobs.finishedAt,
    })
    .from(backgroundJobs);
  return rows
    .filter((r) => r.status !== 'done' || (r.finishedAt && now.getTime() - r.finishedAt.getTime() < 86_400_000))
    .map((r) => ({ id: r.id, status: r.status, done: r.done, total: r.total }));
}
