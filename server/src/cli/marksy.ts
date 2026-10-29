import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { listProviders } from '@marksy/registry';
import { runnerOf } from './login-guard';
import { masterKey } from '../crypto/credentials';
import { createDb, DEFAULT_DATABASE_URL, migrateDb } from '../db/client';
import { devConnect } from '../family/dev-connect';
import { errorSummary, log } from '../log';
import { backupsIn } from '../ops/backup';
import { backupDaemon } from '../ops/daemon';
import { initEnv } from '../ops/init-env';
import { restoreBackup } from '../ops/restore';
import { setSyncEnabled } from '../runtime/instance';
import { instanceStatus } from '../runtime/status';
import { serve } from '../serve';
import { checkOnline } from '../sync/connectivity';
import { readSyncConfig } from '../sync/config';

// `marksy <command>`: the entry point of the server image (docs/running.md). Every operation a host needs runs inside
// a container, so a host with only Docker can run them all: `docker compose … run --rm server <command>` or the
// marksy.sh / marksy.ps1 wrappers. Output is counts, versions, times and key names; never a value of the data.

const env = (k: string) => process.env[k]?.trim() ?? '';
const databaseUrl = () => env('DATABASE_URL') || DEFAULT_DATABASE_URL;
const uploadsDir = () => env('UPLOADS_DIR') || undefined;
const backupDir = () => env('BACKUP_DIR_IN_CONTAINER') || '/backups';

const USAGE = `marksy <command>
  serve                         the server (API, collector)
  migrate                       apply the migrations
  backup                        a backup now, through the backup service
  backup-daemon                 the backup service
  restore <file> [--without-demo] [--replace --yes]
                                restore a backup into an empty database; the collector stays off afterwards
  sync enable|disable           switch the collector on this instance
  status                        versions, sync, backups, disk
  init-env <file> [--credentials-key-from <file>] [--tz <zone>] [--show-hook-secret]
                                create or complete the production settings file
  connect [--provider <id>]     connect the diary from DIARY_LOGIN, DIARY_PASSWORD, MARKSY_DEV_EMAIL, MARKSY_DEV_PASSWORD
  check-network                 can this container reach each diary's host (DNS and TCP, no login)
  healthcheck                   exit 0 when the API answers`;

const flag = (args: string[], name: string) => args.includes(name);
const option = (args: string[], name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

async function internal(base: string, path: string, init?: RequestInit): Promise<Response | null> {
  const token = env('MARKSY_INTERNAL_TOKEN');
  if (!base || !token) return null;
  try {
    return await fetch(`${base}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(init?.method === 'POST' ? 30 * 60_000 : 3000),
    });
  } catch {
    return null;
  }
}

async function cmdBackup(): Promise<number> {
  const res = await internal(env('BACKUP_INTERNAL_URL'), '/backup', { method: 'POST', body: '{"kind":"manual"}' });
  if (!res) {
    console.error('the backup service does not answer: is the stack up (docker compose ps)?');
    return 1;
  }
  const body = (await res.json()) as { file?: string; error?: string };
  if (!res.ok) {
    console.error(`backup failed: ${body.error ?? res.status}`);
    return 1;
  }
  console.log(`backup taken: manual/${body.file}`);
  return 0;
}

async function cmdRestore(args: string[]): Promise<number> {
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('restore needs the backup file: marksy restore /backups/daily/<name>.dump');
    return 2;
  }
  if (flag(args, '--replace') && !flag(args, '--yes')) {
    console.error('--replace replaces the data in the database: add --yes when that is what you want');
    return 2;
  }
  // a running server would write into the database under the restore
  if (await internal(env('SERVER_INTERNAL_URL'), '/internal/status')) {
    console.error(
      'the server is running: stop it first (docker compose stop server; marksy.sh restore does it for you)',
    );
    return 2;
  }
  const report = await restoreBackup({
    databaseUrl: databaseUrl(),
    file,
    ...(uploadsDir() && { uploadsDir: uploadsDir() }),
    withoutDemo: flag(args, '--without-demo'),
    replace: flag(args, '--replace'),
    log: (line) => console.log(line),
  });
  console.log(
    `restored: ${report.tables} tables, ${report.rows} rows, ${report.uploads} pictures, backup of ${report.manifest.version}, ${report.migrationsApplied} migrations applied${report.demoRemoved ? ', demo families removed' : ''}`,
  );
  console.log('every session ended: sign in again');
  console.log('the collector is OFF on this instance; when the old host is stopped: marksy sync enable');
  return 0;
}

async function cmdSync(args: string[]): Promise<number> {
  const on = args[0] === 'enable';
  if (!on && args[0] !== 'disable') {
    console.error('marksy sync enable|disable');
    return 2;
  }
  const db = createDb(databaseUrl());
  try {
    await setSyncEnabled(db, on, on ? 'enabled by command' : 'disabled by command');
    console.log(
      `collector ${on ? 'enabled' : 'disabled'} on this instance${on && readSyncConfig().enabled === false ? ' (SYNC_ENABLED=false still keeps it off)' : ''}`,
    );
    return 0;
  } finally {
    await db.$client.end();
  }
}

async function cmdStatus(): Promise<number> {
  const db = createDb(databaseUrl());
  try {
    const s = await instanceStatus(db, { syncEnv: readSyncConfig().enabled });
    const live = await internal(env('SERVER_INTERNAL_URL'), '/internal/status');
    console.log(`version     ${s.version} (${s.commit})`);
    console.log(`server      ${live?.ok ? 'running' : 'not answering'}`);
    console.log(`migrations  ${s.migrations}`);
    console.log(
      `collector   ${s.sync.enabled ? 'on' : 'off'}${s.sync.switchedOffHere ? ' (switched off on this instance: marksy sync enable)' : ''}, runs in progress ${s.sync.running}`,
    );
    console.log(`last sync   ${s.sync.lastSuccessAt ?? 'never'}`);
    console.log(
      `last backup ${s.backup.lastSuccessAt ?? 'never'}${s.backup.lastFile ? ` (${s.backup.lastFile})` : ''}`,
    );
    if (s.backup.lastFailureAt) console.log(`backup failed at ${s.backup.lastFailureAt}`);
    const dir = backupDir();
    if (existsSync(dir)) {
      const counts = await Promise.all(
        ['daily', 'manual', 'pre-update'].map(async (k) => `${k} ${(await backupsIn(`${dir}/${k}`)).length}`),
      );
      const fs = await statfs(dir);
      console.log(
        `backups     ${counts.join(', ')}; ${Math.round((fs.bavail * fs.bsize) / 1e9)} GB free on their disk`,
      );
    }
    return 0;
  } finally {
    await db.$client.end();
  }
}

function cmdInitEnv(args: string[]): number {
  const target = args.find(
    (a) => !a.startsWith('--') && a !== option(args, '--credentials-key-from') && a !== option(args, '--tz'),
  );
  if (!target) {
    console.error('init-env needs the file to write: marksy init-env /work/.env.production');
    return 2;
  }
  // the image keeps env.example at MARKSY_ENV_TEMPLATE; a development run reads the repository's
  const templatePath = env('MARKSY_ENV_TEMPLATE') || fileURLToPath(new URL('../../../env.example', import.meta.url));
  const from = option(args, '--credentials-key-from');
  const result = initEnv({
    template: readFileSync(templatePath, 'utf8'),
    existing: existsSync(target) ? readFileSync(target, 'utf8') : null,
    credentialsFrom: from ? readFileSync(from, 'utf8') : null,
    ...(option(args, '--tz') && { tz: option(args, '--tz')! }),
  });
  writeFileSync(target, result.text, { mode: 0o600 });
  console.log(`${target}: ${result.added.length} keys added, ${result.kept.length} secrets kept as they were`);
  if (result.generated.length) console.log(`generated: ${result.generated.join(', ')}`);
  if (result.copied.length) console.log(`copied from the other file: ${result.copied.join(', ')}`);
  console.log(
    'keep this file in your password manager next to the backups: without CREDENTIALS_KEY the stored diary passwords cannot be read',
  );
  if (flag(args, '--show-hook-secret')) {
    const line = result.text.split(/\r?\n/).find((l) => l.startsWith('UPDATE_HOOK_SECRET='));
    console.log(
      `UPDATE_HOOK_SECRET for the repository secrets (shown this once): ${line?.slice('UPDATE_HOOK_SECRET='.length) ?? ''}`,
    );
  }
  return 0;
}

async function cmdConnect(args: string[]): Promise<number> {
  const providerId = option(args, '--provider') ?? listProviders()[0]?.manifest.id;
  const missing = ['DIARY_LOGIN', 'DIARY_PASSWORD', 'MARKSY_DEV_EMAIL', 'MARKSY_DEV_PASSWORD'].filter((k) => !env(k));
  if (!providerId || missing.length) {
    console.error(`connect needs ${missing.join(', ') || 'a provider'} (docker compose run -e …, docs/running.md)`);
    return 2;
  }
  const db = createDb(databaseUrl());
  try {
    await migrateDb(db);
    const result = await devConnect(db, {
      providerId,
      diary: { login: env('DIARY_LOGIN'), password: process.env.DIARY_PASSWORD ?? '' },
      marksy: { login: env('MARKSY_DEV_EMAIL'), password: process.env.MARKSY_DEV_PASSWORD ?? '' },
      runner: runnerOf(),
      credentialsKey: masterKey(),
      syncConfig: readSyncConfig(),
      log,
    });
    if (result.outcome === 'refused') {
      console.error(result.message);
      return 3;
    }
    console.log(`connect: ${result.outcome}, ${result.children} children followed`);
    return 0;
  } finally {
    await db.$client.end();
  }
}

async function cmdCheckNetwork(): Promise<number> {
  let failed = 0;
  for (const { manifest } of listProviders()) {
    const host = new URL(manifest.network.baseUrl).host;
    const ok = await checkOnline(manifest.network.baseUrl);
    if (!ok) failed++;
    console.log(`${manifest.id}: ${host} ${ok ? 'reachable (DNS and TCP, nothing was sent)' : 'NOT reachable'}`);
  }
  return failed ? 1 : 0;
}

async function cmdHealthcheck(): Promise<number> {
  try {
    const res = await fetch(`http://127.0.0.1:${env('PORT') || '3000'}/api/health`, {
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? 0 : 1;
  } catch {
    return 1;
  }
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  switch (command) {
    case 'serve':
      await serve();
      return -1;
    case 'migrate': {
      const db = createDb(databaseUrl());
      try {
        console.log(`migrations applied: ${await migrateDb(db)}`);
        return 0;
      } finally {
        await db.$client.end();
      }
    }
    case 'backup':
      return cmdBackup();
    case 'backup-daemon': {
      const token = env('MARKSY_INTERNAL_TOKEN');
      if (!token) throw new Error('MARKSY_INTERNAL_TOKEN must be set (init-env generates it)');
      await backupDaemon({
        db: createDb(databaseUrl()),
        databaseUrl: databaseUrl(),
        dir: backupDir(),
        ...(uploadsDir() && { uploadsDir: uploadsDir() }),
        time: env('BACKUP_TIME') || '03:30',
        port: Number(env('BACKUP_PORT') || 3002),
        token,
      });
      return -1;
    }
    case 'restore':
      return cmdRestore(args);
    case 'sync':
      return cmdSync(args);
    case 'status':
      return cmdStatus();
    case 'init-env':
      return cmdInitEnv(args);
    case 'connect':
      return cmdConnect(args);
    case 'check-network':
      return cmdCheckNetwork();
    case 'healthcheck':
      return cmdHealthcheck();
    default:
      console.log(USAGE);
      return command ? 2 : 0;
  }
}

/** Runs a command and ends the process with its code, unless it is a service that keeps running (-1) */
export async function run(argv: string[]): Promise<void> {
  try {
    const code = await main(argv);
    if (code >= 0) process.exit(code);
  } catch (err) {
    console.error(`marksy ${argv[0] ?? ''} failed: ${err instanceof Error ? err.message : errorSummary(err)}`);
    process.exit(1);
  }
}
