import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { jobsStatus, MAX_ATTEMPTS, runJobs } from './runner';
import type { BackgroundJob } from './runner';

// Background jobs: a step's changes and the cursor commit together, so a job stopped anywhere resumes where it left
// off and never handles an item twice; a failing step changes nothing and the job resumes at the next start.

const db = testDb();

beforeAll(async () => {
  await db.execute(
    sql`create table if not exists job_test_items (id integer primary key, touched integer not null default 0)`,
  );
});
afterAll(async () => {
  await db.execute(sql`drop table if exists job_test_items`);
});
beforeEach(async () => {
  await resetDb(db);
  await db.execute(sql`insert into job_test_items (id) select g from generate_series(1, 10) g`);
});

/** Touches three items a step, after the cursor; can be told to fail inside a step after its writes */
function job(opts: { failAt?: number } = {}): BackgroundJob<number> {
  return {
    id: 'test-touch-items',
    async step(tx, cursor) {
      const after = cursor ?? 0;
      const res = await tx.execute<{ id: number }>(
        sql`update job_test_items set touched = touched + 1
            where id in (select id from job_test_items where id > ${after} order by id limit 3) returning id`,
      );
      const ids = res.rows.map((r) => Number(r.id));
      if (opts.failAt !== undefined && ids.includes(opts.failAt)) throw new Error('boom');
      return { cursor: ids.length ? Math.max(...ids) : null, done: ids.length, total: 10 };
    },
  };
}

const touched = async () =>
  (await db.execute<{ id: number; touched: number }>(sql`select id, touched from job_test_items order by id`)).rows.map(
    (r) => Number(r.touched),
  );

describe('background jobs', () => {
  it('a stopped job resumes from its last step and touches every item exactly once', async () => {
    let steps = 0;
    const stopAfterTwo = () => steps++ >= 2;
    expect(await runJobs(db, [job()], { stopped: stopAfterTwo })).toEqual([]);
    expect(await touched()).toEqual([1, 1, 1, 1, 1, 1, 0, 0, 0, 0]);
    expect(await jobsStatus(db)).toEqual([{ id: 'test-touch-items', status: 'running', done: 6, total: 10 }]);

    expect(await runJobs(db, [job()])).toEqual(['test-touch-items']);
    expect(await touched()).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(await jobsStatus(db)).toEqual([{ id: 'test-touch-items', status: 'done', done: 10, total: 10 }]);
    // a finished job never runs again
    expect(await runJobs(db, [job()])).toEqual([]);
    expect(await touched()).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('a failing step changes nothing; the next start resumes, a few times at most', async () => {
    expect(await runJobs(db, [job({ failAt: 5 })])).toEqual([]);
    // the first step committed, the failing one did not
    expect(await touched()).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect((await jobsStatus(db))[0]).toMatchObject({ status: 'failed', done: 3 });

    expect(await runJobs(db, [job()])).toEqual(['test-touch-items']);
    expect(await touched()).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);

    await resetDb(db);
    await db.execute(sql`insert into job_test_items (id) select g from generate_series(1, 10) g`);
    for (let i = 0; i < MAX_ATTEMPTS; i++) await runJobs(db, [job({ failAt: 1 })]);
    // given up: the status shows it, and nothing more is tried
    expect(await runJobs(db, [job()])).toEqual([]);
    expect(await touched()).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect((await jobsStatus(db))[0]).toMatchObject({ status: 'failed', done: 0 });
  });
});
