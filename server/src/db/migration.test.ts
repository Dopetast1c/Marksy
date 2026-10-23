import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL } from '../../test/db';
import { MIGRATIONS_DIR } from './client';

// The child / family split (migrations 0002 and 0003, docs/design.md 7.1) on a database in the old shape: every row
// is carried over, and a row the new rules cannot take rolls the whole thing back. Each test gets a database of its own.

const ADMIN_URL = Object.assign(new URL(TEST_DATABASE_URL), { pathname: '/postgres' }).toString();
const created: string[] = [];

async function admin(sql: string) {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

/** A migrations folder with only the first `count` migrations: the database as it was before the split */
function firstMigrations(count: number): string {
  const dir = mkdtempSync(join(tmpdir(), 'marksy-migrations-'));
  cpSync(MIGRATIONS_DIR, dir, { recursive: true });
  const journalPath = join(dir, 'meta', '_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
  journal.entries = journal.entries.slice(0, count);
  writeFileSync(journalPath, JSON.stringify(journal));
  return dir;
}

async function databaseAt(count: number) {
  const name = `marksy_mt_${Math.random().toString(36).slice(2, 10)}`;
  await admin(`create database ${name}`);
  created.push(name);
  const url = Object.assign(new URL(TEST_DATABASE_URL), { pathname: `/${name}` }).toString();
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const dir = firstMigrations(count);
  await migrate(drizzle(pool), { migrationsFolder: dir });
  rmSync(dir, { recursive: true, force: true });
  return pool;
}

const F1 = '11111111-1111-4111-8111-111111111111';
const F2 = '22222222-2222-4222-8222-222222222222';
const U1 = '33333333-3333-4333-8333-333333333333';
const A1 = '44444444-4444-4444-8444-444444444444';
const S1 = '55555555-5555-4555-8555-555555555555';
const Y1 = '66666666-6666-4666-8666-666666666666';
const SUB = '77777777-7777-4777-8777-777777777777';

/** A family in the old shape: users with family and role, a child owned by the family and read through its account */
async function oldFamily(db: pg.Pool) {
  await db.query(
    `insert into families (id, name, settings) values
    ($1, 'Example', '{"guidance": true, "sync_window": "08:00-14:00", "low_mark": 4, "drop_step": 0.3}')`,
    [F1],
  );
  await db.query(
    `insert into users (id, family_id, role, login, display_name, password_hash)
    values ($1, $2, 'admin', 'p@example.com', 'P', 'x')`,
    [U1, F1],
  );
  await db.query(
    `insert into diary_accounts (id, family_id, provider_id, role, label) values ($1, $2, 'demo-full', 'parent', 'parent@example.com')`,
    [A1, F1],
  );
  await db.query(
    `insert into students (id, family_id, diary_account_id, provider_id, external_id, full_name)
    values ($1, $2, $3, 'demo-full', 'p-1', 'Пример Ученик')`,
    [S1, F1, A1],
  );
  await db.query(
    `insert into student_identities (provider_id, external_id, student_id, family_id) values ('demo-full', 'p-1', $1, $2)`,
    [S1, F1],
  );
  await db.query(`insert into user_student_access (user_id, student_id) values ($1, $2)`, [U1, S1]);
  await db.query(
    `insert into school_years (id, student_id, provider_id, external_id, label, start_date, end_date)
    values ($1, $2, 'demo-full', 'y', '2025-2026', '2025-09-01', '2026-05-31')`,
    [Y1, S1],
  );
  await db.query(
    `insert into subjects (id, student_id, school_year_id, provider_id, external_id, name, name_norm)
    values ($1, $2, $3, 'demo-full', 'alg', 'Алгебра', 'алгебра')`,
    [SUB, S1, Y1],
  );
  await db.query(
    `insert into lessons (family_id, student_id, provider_id, external_id, date, subject_id, subject_name)
    values ($1, $2, 'demo-full', 'L-1', '2025-09-08', $3, 'Алгебра')`,
    [F1, S1, SUB],
  );
  await db.query(
    `insert into marks (family_id, student_id, provider_id, external_id, date, subject_id, raw, kind, values)
    values ($1, $2, 'demo-full', 'M-1', '2025-09-08', $3, '8', 'numeric', '{8}')`,
    [F1, S1, SUB],
  );
}

const count = async (db: pg.Pool, sql: string) => Number((await db.query(sql)).rows[0].count);
const columnExists = async (db: pg.Pool, table: string, column: string) =>
  (await count(
    db,
    `select count(*) from information_schema.columns where table_name = '${table}' and column_name = '${column}'`,
  )) === 1;

afterEach(async () => {
  for (const name of created.splice(0)) await admin(`drop database if exists ${name} with (force)`);
});

describe('migration: children belong to no family (0002, 0003)', () => {
  it('carries every row over: memberships, links, sources, access, settings', async () => {
    const db = await databaseAt(2);
    await oldFamily(db);
    await migrate(drizzle(db), { migrationsFolder: MIGRATIONS_DIR });

    expect((await db.query('select user_id, family_id, role from memberships')).rows).toEqual([
      { user_id: U1, family_id: F1, role: 'admin' },
    ]);
    expect((await db.query('select family_id, student_id, status, settings from family_students')).rows).toEqual([
      { family_id: F1, student_id: S1, status: 'active', settings: { low_mark: 4, drop_step: 0.3 } },
    ]);
    expect(
      (await db.query('select student_id, diary_account_id, external_id, active from student_sources')).rows,
    ).toEqual([{ student_id: S1, diary_account_id: A1, external_id: 'p-1', active: true }]);
    expect((await db.query('select family_id from user_student_access')).rows).toEqual([{ family_id: F1 }]);
    expect((await db.query('select settings from families')).rows[0].settings).toEqual({ guidance: true });
    expect(await count(db, 'select count(*) from lessons')).toBe(1);
    expect(await count(db, 'select count(*) from marks')).toBe(1);
    for (const [table, column] of [
      ['students', 'family_id'],
      ['users', 'role'],
      ['marks', 'family_id'],
      ['student_identities', 'family_id'],
    ]) {
      expect(await columnExists(db, table!, column!), `${table}.${column}`).toBe(false);
    }
    await db.end();
  });

  it('a row the new rules cannot take rolls back the structure and the data together', async () => {
    const db = await databaseAt(2);
    await oldFamily(db);
    // the same child copied into a second family: one child per (provider, id) cannot hold it
    await db.query(`insert into families (id, name) values ($1, 'Second')`, [F2]);
    await db.query(
      `insert into students (family_id, provider_id, external_id, full_name) values ($1, 'demo-full', 'p-1', 'Пример Ученик')`,
      [F2],
    );
    await expect(migrate(drizzle(db), { migrationsFolder: MIGRATIONS_DIR })).rejects.toThrow();

    expect(await columnExists(db, 'students', 'family_id')).toBe(true);
    expect(await columnExists(db, 'users', 'role')).toBe(true);
    expect(await count(db, "select count(*) from information_schema.tables where table_name = 'memberships'")).toBe(0);
    expect(await count(db, 'select count(*) from drizzle.__drizzle_migrations')).toBe(2);
    expect(await count(db, 'select count(*) from students')).toBe(2);
    await db.end();
  });
});
