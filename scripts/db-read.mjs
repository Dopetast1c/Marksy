// pnpm db:read "<sql>" ["<sql>" ...]: read-only queries on the local marksy database through the Docker container, for
// looking at a shape or a bug (CLAUDE.md: real data is read, never committed). Read-only twice over: every statement
// is checked to be a query (SELECT, WITH, TABLE, VALUES, EXPLAIN without ANALYZE, SHOW, or psql's \d describe
// commands), and psql runs with default_transaction_read_only on, so a write that slipped past the check still fails.
// Statements that could switch that off (SET, RESET, BEGIN, COMMIT, ...) are refused. --tuples prints bare rows (-At).

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CONTAINER } from './db-backup.mjs';

const READ = /^(select|with|table|values|show|explain)\b/i;
const DESCRIBE = /^\\d[a-z+]*(\s|$)/i;
const WRITE =
  /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|vacuum|analyze|cluster|reindex|refresh|lock|call|do|set|reset|begin|start|commit|rollback|end|abort|savepoint|prepare|execute|listen|notify|discard|load|import|security|nextval|setval|set_config|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_terminate_backend|pg_cancel_backend|lo_import|lo_export|dblink)\b/i;

/** Why a statement may not run, or null when it is a read */
export function refusal(sql) {
  // string literals and quoted names cannot hide a keyword, and their content is not a keyword either
  const bare = sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();
  if (!bare) return 'empty statement';
  if (DESCRIBE.test(bare)) return bare.includes(';') ? 'one describe command at a time' : null;
  if (/\\/.test(bare)) return 'psql meta-commands other than \\d are not allowed';
  const statements = bare
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of statements) {
    if (!READ.test(s)) return `not a query: ${s.split(/\s/)[0]}`;
    if (/^explain\b/i.test(s) && /\banalyze\b/i.test(s)) return 'EXPLAIN ANALYZE runs the statement';
    const m = s.match(WRITE);
    if (m) return `"${m[1]}" is not allowed in a read`;
  }
  return null;
}

function main(argv) {
  const tuples = argv.includes('--tuples');
  // pnpm on Windows doubles the backslash of "\d table" on its way to the script
  const sqls = argv.filter((a) => a !== '--tuples').map((a) => a.replace(/^\s*\\+/, '\\'));
  if (!sqls.length) {
    console.error('usage: pnpm db:read [--tuples] "<sql>" ["<sql>" ...]');
    return 2;
  }
  for (const sql of sqls) {
    const why = refusal(sql);
    if (why) {
      console.error(`db:read: refused (${why})`);
      return 2;
    }
  }
  const args = ['exec', '-e', 'PGOPTIONS=-c default_transaction_read_only=on', CONTAINER, 'psql', '-U', 'marksy'];
  args.push('-d', 'marksy', '-v', 'ON_ERROR_STOP=1', '-X', ...(tuples ? ['-At'] : []));
  for (const sql of sqls) args.push('-c', sql);
  const r = spawnSync('docker', args, { stdio: 'inherit' });
  if (r.error) {
    console.error(`db:read: ${r.error.message} (is Docker Desktop running? pnpm db:up)`);
    return 1;
  }
  return r.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
