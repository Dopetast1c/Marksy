import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import pg from 'pg';
import { createDb, migrateDb } from '../db/client';
import { sessions } from '../db/schema';
import { setSyncEnabled } from '../runtime/instance';
import { removeDemoFamilies } from '../seed/seed';
import { countMismatches, parseManifest, sha256File } from './manifest';
import type { BackupManifest } from './manifest';
import { pgTarget, runTool } from './pg';
import { unpackTo } from './tar';

// A restore (docs/running.md, restore and moving hosts): into an empty database only (or one with no family and no
// login yet, as a freshly started server leaves it), checked file by file against the manifest's checksums and table by
// table against its counts, then brought up to the running version by the migrations. It always leaves the collector
// switched off on this instance (instance_state), so the old host and the new one never read a diary at the same time,
// and ends every session (a session from another host or the development machine never carries over).

export interface RestoreOptions {
  databaseUrl: string;
  /** the manifest (.json) or the dump (.dump) of a backup; the other files are found next to it */
  file: string;
  uploadsDir?: string;
  /** drop the families of the seed (pnpm db:seed) after restoring: a copy of a development database */
  withoutDemo?: boolean;
  /** replace a database that has data: the last-resort return to a pre-update backup */
  replace?: boolean;
  tool?: typeof runTool;
  log?: (line: string) => void;
}

export interface RestoreReport {
  manifest: BackupManifest;
  tables: number;
  rows: number;
  migrationsApplied: number;
  uploads: number;
  demoRemoved: boolean;
}

/** The manifest of a backup from the path of any of its files */
export async function readBackup(file: string): Promise<{ manifest: BackupManifest; folder: string }> {
  const folder = dirname(file);
  const base = basename(file).replace(/(\.uploads\.tar\.gz|\.dump|\.json)$/, '');
  const manifest = parseManifest(await readFile(join(folder, `${base}.json`), 'utf8'));
  return { manifest, folder };
}

async function hasData(client: pg.Client): Promise<boolean> {
  const { rows } = await client.query<{ n: string }>(
    "select count(*) as n from information_schema.tables where table_schema = 'public' and table_name in ('families', 'users')",
  );
  if (rows[0]?.n !== '2') {
    const { rows: any } = await client.query<{ n: string }>(
      "select count(*) as n from information_schema.tables where table_schema = 'public'",
    );
    return any[0]?.n !== '0';
  }
  const { rows: people } = await client.query<{ n: string }>(
    'select (select count(*) from families) + (select count(*) from users) as n',
  );
  return people[0]?.n !== '0';
}

async function tableCounts(client: pg.Client, tables: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of tables) {
    const exists = await client.query(
      "select 1 from information_schema.tables where table_schema = 'public' and table_name = $1",
      [t],
    );
    if (!exists.rowCount) continue;
    const { rows } = await client.query<{ n: string }>(`select count(*) as n from "public"."${t.replace(/"/g, '""')}"`);
    out[t] = Number(rows[0]?.n ?? 0);
  }
  return out;
}

export async function restoreBackup(opts: RestoreOptions): Promise<RestoreReport> {
  const tool = opts.tool ?? runTool;
  const log = opts.log ?? (() => undefined);
  const { manifest, folder } = await readBackup(opts.file);
  const dumpPath = join(folder, manifest.dump.file);
  if ((await sha256File(dumpPath)) !== manifest.dump.sha256)
    throw new Error('the dump does not match its manifest (damaged or changed)');
  if (manifest.uploads && (await sha256File(join(folder, manifest.uploads.file))) !== manifest.uploads.sha256)
    throw new Error('the pictures archive does not match its manifest (damaged or changed)');

  const client = new pg.Client({ connectionString: opts.databaseUrl });
  await client.connect();
  try {
    if (await hasData(client)) {
      if (!opts.replace)
        throw new Error('the database has data: restore goes into an empty one (--replace --yes replaces it)');
      log('replacing the data in the database');
    }
    // an empty start: no schema of a previous start, no leftovers
    await client.query(
      'drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public',
    );
  } finally {
    await client.end();
  }

  const target = pgTarget(opts.databaseUrl);
  log('restoring the dump');
  await tool(
    'pg_restore',
    [
      ...target.args,
      '-d',
      target.database,
      '--no-owner',
      '--no-privileges',
      '--exit-on-error',
      '--single-transaction',
      dumpPath,
    ],
    target.env,
  );

  const check = new pg.Client({ connectionString: opts.databaseUrl });
  await check.connect();
  let counts: Record<string, number>;
  try {
    counts = await tableCounts(check, Object.keys(manifest.tables));
  } finally {
    await check.end();
  }
  const mismatches = countMismatches(manifest.tables, counts);
  if (mismatches.length) throw new Error(`the restored rows differ from the backup: ${mismatches.join('; ')}`);
  log(`rows match the manifest: ${Object.keys(counts).length} tables`);

  let uploads = 0;
  if (manifest.uploads && opts.uploadsDir) {
    await mkdir(opts.uploadsDir, { recursive: true });
    for (const entry of await readdir(opts.uploadsDir))
      await rm(join(opts.uploadsDir, entry), { recursive: true, force: true });
    uploads = await unpackTo(join(folder, manifest.uploads.file), opts.uploadsDir);
    log(`pictures restored: ${uploads}`);
  }

  const db = createDb(opts.databaseUrl);
  try {
    const applied = await migrateDb(db);
    log(`migrations applied: ${applied}`);
    if (opts.withoutDemo) await db.transaction((tx) => removeDemoFamilies(tx));
    await db.delete(sessions);
    await setSyncEnabled(db, false, `restored from ${basename(manifest.dump.file)}`);
    return {
      manifest,
      tables: Object.keys(counts).length,
      rows: Object.values(counts).reduce((a, b) => a + b, 0),
      migrationsApplied: applied,
      uploads,
      demoRemoved: !!opts.withoutDemo,
    };
  } finally {
    await db.$client.end();
  }
}

/** Whether a path exists, for the commands' messages */
export const exists = (path: string) => existsSync(path);
