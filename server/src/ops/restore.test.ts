import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { TEST_DATABASE_URL } from '../../test/db';
import { createDb, migrateDb, MIGRATIONS_DIR } from '../db/client';
import { families, sessions, users } from '../db/schema';
import { syncEnabledHere } from '../runtime/instance';
import { seedDemo } from '../seed/seed';
import { takeBackup } from './backup';
import { containerTools } from './docker-tools';
import { restoreBackup } from './restore';

// Backup and restore (docs/running.md): the seeded demo database is backed up, restored into a fresh database and
// compared table by table; a dump of an older schema is brought up to the current one; a database with data is not
// overwritten without --replace; the collector is always off afterwards and no session survives. pg_dump and
// pg_restore run in the test database's container (MARKSY_PG_TOOLS_CONTAINER in CI), the same as `pnpm db:export`.

const ADMIN_URL = Object.assign(new URL(TEST_DATABASE_URL), { pathname: '/postgres' }).toString();
const TOOLS = containerTools(process.env.MARKSY_PG_TOOLS_CONTAINER || 'marksy-postgres-test');
const created: string[] = [];
const dirs: string[] = [];

async function admin(sql: string) {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

async function freshUrl(): Promise<string> {
  const name = `marksy_rs_${Math.random().toString(36).slice(2, 10)}`;
  await admin(`create database ${name}`);
  created.push(name);
  return Object.assign(new URL(TEST_DATABASE_URL), { pathname: `/${name}` }).toString();
}

const tempDir = (prefix: string) => {
  const d = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(d);
  return d;
};

async function counts(url: string): Promise<Record<string, number>> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const { rows } = await c.query<{ name: string }>(
      "select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
    );
    const out: Record<string, number> = {};
    for (const r of rows)
      out[r.name] = Number((await c.query<{ n: string }>(`select count(*) as n from "${r.name}"`)).rows[0]!.n);
    return out;
  } finally {
    await c.end();
  }
}

afterAll(async () => {
  for (const name of created) await admin(`drop database if exists ${name} with (force)`);
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

describe('backup and restore', () => {
  it('the seeded demo database comes back whole in a fresh database, pictures included; collector off, no session', async () => {
    const sourceUrl = await freshUrl();
    const source = createDb(sourceUrl);
    await migrateDb(source);
    await seedDemo(source, { now: new Date('2026-10-15T16:12:00Z') });
    await source.$client.end();
    const uploads = tempDir('marksy-up-');
    mkdirSync(join(uploads, 'avatars'));
    writeFileSync(
      join(uploads, 'avatars', '00000000-0000-4000-8000-000000000001.jpg'),
      Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    );

    const backups = tempDir('marksy-bk-');
    const { name, manifest } = await takeBackup({
      databaseUrl: sourceUrl,
      dir: backups,
      kind: 'manual',
      version: '1.0.0',
      commit: 'test',
      uploadsDir: uploads,
      tool: TOOLS,
    });
    expect(manifest.tables.families).toBeGreaterThan(0);
    expect(manifest.uploads?.files).toBe(1);
    expect(readdirSync(join(backups, 'manual')).filter((f) => f.endsWith('.part'))).toEqual([]);

    const targetUrl = await freshUrl();
    const restoredUploads = tempDir('marksy-up2-');
    const report = await restoreBackup({
      databaseUrl: targetUrl,
      file: join(backups, 'manual', `${name}.dump`),
      uploadsDir: restoredUploads,
      tool: TOOLS,
    });
    expect(report.migrationsApplied).toBe(0);
    const after = await counts(targetUrl);
    const expected = { ...manifest.tables, sessions: 0 };
    expect(after).toEqual(expected);
    expect(readFileSync(join(restoredUploads, 'avatars', '00000000-0000-4000-8000-000000000001.jpg'))).toHaveLength(4);
    const target = createDb(targetUrl);
    expect(await syncEnabledHere(target)).toBe(false);
    expect(await target.select().from(sessions)).toEqual([]);

    // a second restore over data is refused without --replace
    await expect(
      restoreBackup({ databaseUrl: targetUrl, file: join(backups, 'manual', `${name}.json`), tool: TOOLS }),
    ).rejects.toThrow(/has data/);
    // --without-demo: the seed's families and logins go, nothing else of the schema is touched
    await restoreBackup({
      databaseUrl: targetUrl,
      file: join(backups, 'manual', `${name}.json`),
      replace: true,
      withoutDemo: true,
      tool: TOOLS,
    });
    expect(await target.select().from(families)).toEqual([]);
    expect(await target.select().from(users)).toEqual([]);
    await target.$client.end();
  });

  it('a dump of an older schema is brought up to the current one', async () => {
    const oldUrl = await freshUrl();
    const dir = mkdtempSync(join(tmpdir(), 'marksy-migrations-'));
    dirs.push(dir);
    cpSync(MIGRATIONS_DIR, dir, { recursive: true });
    const journalPath = join(dir, 'meta', '_journal.json');
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: unknown[] };
    const total = journal.entries.length;
    journal.entries = journal.entries.slice(0, 10);
    writeFileSync(journalPath, JSON.stringify(journal));
    const pool = new pg.Pool({ connectionString: oldUrl, max: 2 });
    await migrate(drizzle(pool), { migrationsFolder: dir });
    await pool.end();

    const backups = tempDir('marksy-bk-old-');
    const { name, manifest } = await takeBackup({
      databaseUrl: oldUrl,
      dir: backups,
      kind: 'daily',
      version: '0.9.0',
      commit: 'old',
      tool: TOOLS,
    });
    expect(manifest.migrations).toBe(10);

    const targetUrl = await freshUrl();
    const report = await restoreBackup({
      databaseUrl: targetUrl,
      file: join(backups, 'daily', `${name}.dump`),
      tool: TOOLS,
    });
    expect(report.migrationsApplied).toBe(total - 10);
    const after = await counts(targetUrl);
    expect(after).toHaveProperty('instance_state', 1);
    expect(after).toHaveProperty('backup_runs', 0);
  });
});
