import { mkdir, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import type { Db } from '../db/client';
import { backupRuns } from '../db/schema';
import type { BackupKind } from '../db/schema';
import { keepDaily, keepNewest } from './rotation';
import { MANIFEST_FORMAT, sha256File } from './manifest';
import type { BackupFile, BackupManifest } from './manifest';
import { pgTarget, runTool } from './pg';
import { packDir } from './tar';

// One backup (docs/running.md, backups): a pg_dump in custom format, the uploaded pictures as a tar, and the manifest,
// all taken from one snapshot of the database, so the counts in the manifest are exactly what the dump holds. Files are
// written under a .part name and renamed when complete: a backup that is there is whole. Each kind has its own folder
// and its own rotation; every attempt is a backup_runs row.

export const BACKUP_FOLDERS: Record<BackupKind, string> = {
  daily: 'daily',
  manual: 'manual',
  'pre-update': 'pre-update',
};

export interface BackupOptions {
  databaseUrl: string;
  /** BACKUP_DIR inside the container */
  dir: string;
  kind: BackupKind | 'export';
  version: string;
  commit: string;
  toVersion?: string | null;
  uploadsDir?: string;
  /** where the export of `pnpm db:export` goes: a folder of its own instead of dir/<kind> */
  folder?: string;
  now?: Date;
  /** pg_dump: the real tool by default */
  tool?: typeof runTool;
}

export interface BackupResult {
  name: string;
  folder: string;
  manifest: BackupManifest;
}

const stampOf = (d: Date) =>
  d
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')
    .replace(/:/g, '-');
const safeVersion = (v: string) => v.replace(/[^0-9A-Za-z.+-]/g, '_');

export function backupName(kind: string, at: Date, version: string, toVersion?: string | null) {
  return `marksy-${stampOf(at)}-${kind}-${safeVersion(version)}${toVersion ? `-to-${safeVersion(toVersion)}` : ''}`;
}

async function fileInfo(path: string, file: string): Promise<BackupFile> {
  return { file, bytes: (await stat(path)).size, sha256: await sha256File(path) };
}

async function countFiles(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    return entries.filter((e) => e.isFile()).length;
  } catch {
    return 0;
  }
}

/** Takes one backup; throws with a short English reason when it cannot (no space, a tool failed) */
export async function takeBackup(opts: BackupOptions): Promise<BackupResult> {
  const now = opts.now ?? new Date();
  const tool = opts.tool ?? runTool;
  const folder = opts.folder ?? join(opts.dir, opts.kind === 'export' ? 'export' : BACKUP_FOLDERS[opts.kind]);
  await mkdir(folder, { recursive: true });
  const name = backupName(opts.kind, now, opts.version, opts.toVersion);
  const target = pgTarget(opts.databaseUrl);

  const client = new pg.Client({ connectionString: opts.databaseUrl });
  await client.connect();
  const parts: string[] = [];
  try {
    // free space first: the dump of a database is smaller than the database, the pictures are what they are
    const { rows: size } = await client.query<{ n: string }>('select pg_database_size(current_database()) as n');
    const uploadsFiles = opts.uploadsDir ? await countFiles(opts.uploadsDir) : 0;
    const fs = await statfs(folder);
    const free = fs.bavail * fs.bsize;
    const needed = Number(size[0]?.n ?? 0) + 50 * 1024 * 1024;
    if (free < needed)
      throw new Error(
        `not enough free space for a backup: ${Math.round(free / 1e6)} MB free, about ${Math.round(needed / 1e6)} MB needed`,
      );

    // one snapshot for the counts and the dump
    await client.query('begin isolation level repeatable read read only');
    const { rows: snap } = await client.query<{ s: string }>('select pg_export_snapshot() as s');
    const { rows: tables } = await client.query<{ name: string }>(
      "select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1",
    );
    const counts: Record<string, number> = {};
    for (const t of tables) {
      const { rows } = await client.query<{ n: string }>(
        `select count(*) as n from "public"."${t.name.replace(/"/g, '""')}"`,
      );
      counts[t.name] = Number(rows[0]?.n ?? 0);
    }
    const { rows: mig } = await client.query<{ n: string }>(
      "select count(*) as n from information_schema.tables where table_schema = 'drizzle' and table_name = '__drizzle_migrations'",
    );
    const migrations =
      mig[0]?.n === '0'
        ? 0
        : Number(
            (await client.query<{ n: string }>('select count(*) as n from drizzle.__drizzle_migrations')).rows[0]?.n,
          );

    const dumpPart = join(folder, `${name}.dump.part`);
    parts.push(dumpPart);
    await tool(
      'pg_dump',
      [
        ...target.args,
        '-d',
        target.database,
        '-Fc',
        '--no-owner',
        '--no-privileges',
        `--snapshot=${snap[0]!.s}`,
        '-f',
        dumpPart,
      ],
      target.env,
    );
    await client.query('commit');

    let uploads: BackupManifest['uploads'] = null;
    if (opts.uploadsDir && uploadsFiles > 0) {
      const tarPart = join(folder, `${name}.uploads.tar.gz.part`);
      parts.push(tarPart);
      const files = await packDir(opts.uploadsDir, tarPart);
      await rename(tarPart, join(folder, `${name}.uploads.tar.gz`));
      uploads = { ...(await fileInfo(join(folder, `${name}.uploads.tar.gz`), `${name}.uploads.tar.gz`)), files };
    }
    await rename(dumpPart, join(folder, `${name}.dump`));
    const manifest: BackupManifest = {
      format: MANIFEST_FORMAT,
      app: 'marksy',
      kind: opts.kind,
      createdAt: now.toISOString(),
      version: opts.version,
      commit: opts.commit,
      toVersion: opts.toVersion ?? null,
      migrations,
      tables: counts,
      dump: await fileInfo(join(folder, `${name}.dump`), `${name}.dump`),
      uploads,
    };
    await writeFile(join(folder, `${name}.json`), `${JSON.stringify(manifest, null, 2)}\n`);
    return { name, folder, manifest };
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    for (const p of parts) await rm(p, { force: true });
    throw err;
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** A backup recorded in backup_runs, success or failure (the status command and, from M9, the admin alert read it) */
export async function recordedBackup(db: Db, opts: BackupOptions & { kind: BackupKind }): Promise<BackupResult> {
  const startedAt = opts.now ?? new Date();
  try {
    const result = await takeBackup(opts);
    await db.insert(backupRuns).values({
      kind: opts.kind,
      file: `${BACKUP_FOLDERS[opts.kind]}/${result.name}.dump`,
      version: opts.version,
      toVersion: opts.toVersion ?? null,
      sizeBytes: result.manifest.dump.bytes + (result.manifest.uploads?.bytes ?? 0),
      status: 'success',
      startedAt,
      finishedAt: new Date(),
    });
    return result;
  } catch (err) {
    await db
      .insert(backupRuns)
      .values({
        kind: opts.kind,
        version: opts.version,
        toVersion: opts.toVersion ?? null,
        status: 'failed',
        error: (err instanceof Error ? err.message : 'failed').slice(0, 300),
        startedAt,
        finishedAt: new Date(),
      })
      .catch(() => undefined);
    throw err;
  }
}

/** The backups of one folder, by name and time (from the manifests' names) */
export async function backupsIn(folder: string): Promise<{ name: string; at: Date }[]> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.json'))
    .map((n) => n.slice(0, -'.json'.length))
    .map((name) => {
      const m = name.match(/^marksy-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z/);
      return m ? { name, at: new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) } : null;
    })
    .filter((x): x is { name: string; at: Date } => !!x);
}

/** Removes what the rotation does not keep, in the daily and the pre-update folders; returns the names removed */
export async function rotateBackups(dir: string): Promise<string[]> {
  const removed: string[] = [];
  for (const [kind, keep] of [
    ['daily', keepDaily],
    ['pre-update', keepNewest],
  ] as const) {
    const folder = join(dir, BACKUP_FOLDERS[kind]);
    const all = await backupsIn(folder);
    const kept = keep(all);
    for (const b of all) {
      if (kept.has(b.name)) continue;
      for (const ext of ['.json', '.dump', '.uploads.tar.gz'])
        await rm(join(folder, `${b.name}${ext}`), { force: true });
      removed.push(b.name);
    }
  }
  return removed;
}
