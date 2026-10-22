import pg from 'pg';
import { createDb, migrateDb } from '../src/db/client';
import { TEST_DATABASE_URL } from './db';

// Runs once before the server tests: the test database (never DATABASE_URL) is wiped and migrated from scratch, so a
// changed migration never meets an old schema. Needs `pnpm db:up`.
export default async function setup() {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  try {
    await client.connect();
  } catch (err) {
    throw new Error(`The test database is not reachable at ${new URL(TEST_DATABASE_URL).host}: run pnpm db:up`, {
      cause: err,
    });
  }
  await client.query(
    'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public',
  );
  await client.end();
  const db = createDb(TEST_DATABASE_URL);
  await migrateDb(db);
  await db.$client.end();
}
