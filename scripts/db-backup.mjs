// pnpm db:backup: a pg_dump of the local marksy database through the Docker container into
// data/backups/marksy-<time>.sql.gz (gitignored with data/), keeping the last five. The dump is then verified: it is
// restored into a temporary database marksy_restore_check, the row count of every table is compared with marksy, and
// the temporary database is dropped. Only that database: marksy and the Docker volume are never touched. Output is
// table names and numbers, never row contents. pnpm db:restore <file> puts a dump back (scripts/db-restore.mjs).

import { spawn, spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip } from 'node:zlib';

export const CONTAINER = 'marksy-postgres';
const USER = 'marksy';
const SOURCE = 'marksy';
const CHECK = 'marksy_restore_check';
const KEEP = 5;
export const BACKUPS = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'backups');
const dir = BACKUPS;

/**
 * The first error line of psql or pg_dump, without what may quote a row: DETAIL and CONTEXT lines are left out, quoted
 * text and key values are masked (a failed COPY or a key violation repeats the row's values).
 */
export function errorLine(stderr) {
  const line = (stderr || '').split(/\r?\n/).find((l) => /error/i.test(l)) ?? '';
  return line
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .replace(/=\([^)]*\)/g, '=(…)')
    .trim()
    .slice(0, 200);
}

export function psql(db, sql) {
  const r = spawnSync(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', USER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-tAc', sql],
    {
      encoding: 'utf8',
    },
  );
  if (r.status !== 0) throw new Error(`psql on ${db} failed (exit ${r.status}): ${errorLine(r.stderr)}`);
  return r.stdout.trim();
}

/** Runs a command, feeding stdin from a stream or piping stdout into one; resolves with the exit code */
function run(args, { input, output } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: [input ? 'pipe' : 'ignore', output ? 'pipe' : 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    const piping = [];
    if (input) piping.push(pipeline(input, child.stdin));
    if (output) piping.push(pipeline(child.stdout, output));
    child.on('error', reject);
    child.on('close', async (code) => {
      try {
        await Promise.all(piping);
      } catch (e) {
        return reject(e);
      }
      if (code !== 0) reject(new Error(`docker ${args.slice(0, 3).join(' ')} exited ${code}: ${errorLine(err)}`));
      else resolve(code);
    });
  });
}

/** Row count per table of the public and drizzle schemas: "schema.table" -> n */
export function counts(db) {
  const tables = psql(
    db,
    "select table_schema || '.' || table_name from information_schema.tables where table_schema in ('public', 'drizzle') and table_type = 'BASE TABLE' order by 1",
  )
    .split('\n')
    .filter(Boolean);
  if (tables.length === 0) return new Map();
  const query = tables
    .map(
      (t) =>
        `select '${t}', count(*) from ${t
          .split('.')
          .map((p) => `"${p}"`)
          .join('.')}`,
    )
    .join(' union all ');
  return new Map(
    psql(db, query)
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, n] = line.split('|');
        return [name, Number(n)];
      }),
  );
}

export async function restoreInto(db, file) {
  await run(
    ['exec', '-i', CONTAINER, 'psql', '-U', USER, '-d', db, '-v', 'ON_ERROR_STOP=1', '-q', '--single-transaction'],
    {
      input: createReadStream(file).pipe(createGunzip()),
    },
  );
}

async function main() {
  mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(dir, `marksy-${stamp}.sql.gz`);
  // streamed through gzip into the file; --clean --if-exists: the dump drops what it recreates, so db:restore works on
  // a database that already has the schema
  await new Promise((resolve, reject) => {
    const child = spawn(
      'docker',
      ['exec', CONTAINER, 'pg_dump', '-U', USER, '-d', SOURCE, '--clean', '--if-exists', '--no-owner'],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    const writing = pipeline(child.stdout, createGzip(), createWriteStream(file));
    child.on('error', reject);
    child.on('close', (code) =>
      writing.then(
        () => (code === 0 ? resolve() : reject(new Error(`pg_dump exited ${code}: ${errorLine(err)}`))),
        reject,
      ),
    );
  });
  console.log(`dump: ${file} (${Math.round(statSync(file).size / 1024)} KB)`);

  // verify: restore into a scratch database and compare row counts table by table
  psql('postgres', `drop database if exists ${CHECK} with (force)`);
  psql('postgres', `create database ${CHECK}`);
  try {
    await restoreInto(CHECK, file);
    const a = counts(SOURCE);
    const b = counts(CHECK);
    const names = [...new Set([...a.keys(), ...b.keys()])].sort();
    const differ = names.filter((n) => a.get(n) !== b.get(n));
    const rows = [...a.values()].reduce((s, n) => s + n, 0);
    if (differ.length) {
      console.error('verify FAILED: row counts differ (table: marksy / restored)');
      for (const n of differ) console.error(`  ${n}: ${a.get(n) ?? '-'} / ${b.get(n) ?? '-'}`);
      process.exitCode = 1;
    } else {
      console.log(`verify: restored into ${CHECK}, ${names.length} tables, ${rows} rows, every count equal`);
    }
  } finally {
    psql('postgres', `drop database if exists ${CHECK} with (force)`);
    console.log(`${CHECK} dropped`);
  }

  // keep the newest five dumps
  const dumps = readdirSync(dir)
    .filter((f) => /^marksy-.*\.sql\.gz$/.test(f))
    .sort()
    .reverse();
  for (const old of dumps.slice(KEEP)) rmSync(join(dir, old));
  if (dumps.length > KEEP) console.log(`removed ${dumps.length - KEEP} older dump(s), kept ${KEEP}`);
}

// run as a script, not when db-restore.mjs imports the helpers
if (process.argv[1]?.endsWith('db-backup.mjs')) {
  main().catch((err) => {
    console.error(`db:backup failed: ${err.message}`);
    process.exit(1);
  });
}
