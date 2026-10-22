import type { Logger } from '@marksy/core';
import { and, isNotNull, isNull } from 'drizzle-orm';
import { schedule } from 'node-cron';
import type { Db } from '../db/client';
import { errorSummary } from '../log';
import { diaryAccounts } from '../db/schema';
import type { SyncConfig } from './config';
import type { Trigger } from './plan';
import { runSync } from './run';

// The tick (docs/design.md 10.4, "Tick, not cron"): every SYNC_TICK_MIN minutes, a few seconds late on purpose, and
// once 1 to 3 minutes after start. A tick asks the planner about every account that has credentials and needs no
// action; families without a diary account (the seeded demo family) have nothing to tick. Ticks never overlap in this
// process, and the advisory lock in runSync keeps two processes apart too.

export interface Scheduler {
  /** One tick now, for tests and for the start-up run */
  tick(trigger: Trigger): Promise<void>;
  stop(): void;
}

export interface SchedulerOptions {
  db: Db;
  config: SyncConfig;
  log: Logger;
  /** Runs after each tick: the retention janitor (server/src/retention.ts) */
  afterTick?: () => Promise<void>;
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createScheduler(opts: SchedulerOptions): Scheduler {
  const { db, config, log } = opts;
  const random = opts.random ?? Math.random;
  const sleep = opts.sleep ?? defaultSleep;
  let busy = false;

  async function tick(trigger: Trigger) {
    if (busy) return;
    busy = true;
    try {
      const accounts = await db
        .select({ id: diaryAccounts.id })
        .from(diaryAccounts)
        .where(and(isNull(diaryAccounts.requiresAction), isNotNull(diaryAccounts.credentialsEnc)));
      for (const a of accounts) {
        try {
          const r = await runSync({ db, accountId: a.id, trigger, config, log });
          if (r.outcome === 'ran')
            log.info('sync run', { outcome: r.status, reason: r.errorClass ?? '', count: r.requests });
        } catch (err) {
          log.error('sync run failed', { reason: errorSummary(err) });
        }
      }
      await opts.afterTick?.();
    } catch (err) {
      // never rethrown: node-cron would print the whole error (a failed query carries its parameters), and an
      // unhandled rejection from the start-up tick would stop the process
      log.error('sync tick failed', { reason: errorSummary(err) });
    } finally {
      busy = false;
    }
  }

  const task = schedule(`*/${config.tickMinutes} * * * *`, async () => {
    // a few seconds late, so the diary never sees requests at an exact minute
    await sleep(random() * 30_000);
    await tick('schedule');
  });
  const startup = setTimeout(() => void tick('startup'), 60_000 + random() * 120_000);

  return {
    tick,
    stop() {
      clearTimeout(startup);
      void task.stop();
    },
  };
}
