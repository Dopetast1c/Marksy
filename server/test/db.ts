import { afterAll } from 'vitest';
import { createDb } from '../src/db/client';
import type { Db } from '../src/db/client';

// The test database (docker/postgres/init.sql creates it). Test files run one at a time (vitest.config.ts) and each
// test starts from empty tables with resetDb().

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://marksy:marksy@localhost:5432/marksy_test';

let db: Db | undefined;

/** One pool per test file, closed after the file. */
export function testDb(): Db {
  if (!db) {
    const created = createDb(TEST_DATABASE_URL);
    db = created;
    afterAll(async () => {
      await created.$client.end();
      db = undefined;
    });
  }
  return db;
}

export async function resetDb(target: Db = testDb()): Promise<void> {
  const { rows } = await target.$client.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  if (rows.length === 0) return;
  await target.$client.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} restart identity cascade`);
}
