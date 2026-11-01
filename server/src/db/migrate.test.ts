import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL } from '../../test/db';
import { createDb, migrateDb, MIGRATIONS_DIR } from './client';
import type { Db } from './client';

// Migrations on start (CLAUDE.md, migrations): every pending file in one transaction under an advisory lock. A failing
// file leaves the schema exactly as it was, so the previous image still runs on it; two processes starting at once
// migrate once. Each test gets a database of its own.

const ADMIN_URL = Object.assign(new URL(TEST_DATABASE_URL), { pathname: '/postgres' }).toString();
const created: string[] = [];
const pools: Db[] = [];

async function admin(sql: string) {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

async function freshDb(): Promise<Db> {
  const name = `marksy_mg_${Math.random().toString(36).slice(2, 10)}`;
  await admin(`create database ${name}`);
  created.push(name);
  const db = createDb(Object.assign(new URL(TEST_DATABASE_URL), { pathname: `/${name}` }).toString());
  pools.push(db);
  return db;
}

/** The real migrations plus extra ones, as a folder the migrator can read */
function withExtra(extra: { tag: string; sql: string }[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'marksy-migrations-'));
  cpSync(MIGRATIONS_DIR, dir, { recursive: true });
  const journalPath = join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { idx: number; when: number }[] };
  for (const m of extra) {
    const last = journal.entries.at(-1)!;
    journal.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1000, tag: m.tag } as never);
    writeFileSync(join(dir, `${m.tag}.sql`), m.sql);
  }
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

const tableExists = async (db: Db, name: string) =>
  (
    await db.$client.query(
      "select 1 from information_schema.tables where table_schema = 'public' and table_name = $1",
      [name],
    )
  ).rowCount === 1;

const appliedCount = async (db: Db) =>
  Number((await db.$client.query<{ n: string }>('select count(*) as n from drizzle.__drizzle_migrations')).rows[0]!.n);

afterAll(async () => {
  for (const db of pools) await db.$client.end();
  for (const name of created) await admin(`drop database if exists ${name} with (force)`);
});

describe('migrations on start', () => {
  it('a failing migration rolls back every file of the start: the schema stays exactly as it was', async () => {
    const db = await freshDb();
    await migrateDb(db);
    const before = await appliedCount(db);
    const dir = withExtra([
      { tag: '9001_good', sql: 'CREATE TABLE "r1_good" ("id" integer);' },
      {
        tag: '9002_bad',
        sql: 'CREATE TABLE "r1_half" ("id" integer);\n--> statement-breakpoint\nSELECT * FROM "no_such_table";',
      },
    ]);
    try {
      await expect(migrateDb(db, dir)).rejects.toThrow();
      expect(await tableExists(db, 'r1_good')).toBe(false);
      expect(await tableExists(db, 'r1_half')).toBe(false);
      expect(await appliedCount(db)).toBe(before);
      // the lock is given back: the next start migrates normally
      expect(await migrateDb(db)).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('two processes starting at once migrate once', async () => {
    const db = await freshDb();
    const other = createDb(db.$client.options.connectionString);
    pools.push(other);
    const [a, b] = await Promise.all([migrateDb(db), migrateDb(other)]);
    const total = JSON.parse(readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')).entries.length;
    expect(a + b).toBe(total);
    expect(Math.min(a, b)).toBe(0);
    expect(await appliedCount(db)).toBe(total);
    expect(await tableExists(db, 'instance_state')).toBe(true);
  });
});
