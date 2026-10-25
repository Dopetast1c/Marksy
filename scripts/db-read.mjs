// pnpm db:read "<sql>" ["<sql>" ...]: read-only queries on the local marksy database through the Docker container, for
// looking at a shape or a bug (CLAUDE.md: real data is read, never committed). The database is the boundary: the
// queries run as marksy_read, a role with SELECT on the tables and nothing else (no superuser, no write privilege,
// read-only transactions by default), made and granted by a fixed script before each run, so a statement that slipped
// past the check below still cannot write. The check is a convenience that says early what will not run: one statement
// per argument, a query (SELECT, WITH, TABLE, VALUES, EXPLAIN without ANALYZE, SHOW) or a psql \d describe command,
// no keyword that writes or changes the session. --tuples prints bare rows (-At).

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CONTAINER } from './db-backup.mjs';

export const READ_ROLE = 'marksy_read';

/** Run as the database owner before every read: no input of the caller's goes into it */
export const ROLE_SETUP = [
  `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${READ_ROLE}') THEN`,
  `CREATE ROLE ${READ_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION; END IF; END $$;`,
  `ALTER ROLE ${READ_ROLE} SET default_transaction_read_only = on;`,
  `GRANT CONNECT ON DATABASE marksy TO ${READ_ROLE};`,
  `GRANT USAGE ON SCHEMA public TO ${READ_ROLE};`,
  `GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${READ_ROLE};`,
].join(' ');

const READ = /^(select|with|table|values|show|explain)\b/i;
const DESCRIBE = /^\\d[a-z+]*( [\w.*"]+)?$/i;
const WRITE =
  /\b(insert|update|delete|merge|truncate|drop|alter|create|grant|revoke|copy|vacuum|analyze|cluster|reindex|refresh|lock|call|do|set|reset|begin|start|commit|rollback|end|abort|savepoint|prepare|execute|listen|notify|discard|load|import|security|nextval|setval|set_config|pg_read_file|pg_read_binary_file|pg_ls_dir|pg_terminate_backend|pg_cancel_backend|lo_import|lo_export|dblink)\b/i;

/**
 * The statement with every string, quoted name and comment taken out, read left to right the way PostgreSQL reads it
 * ('…' with '' inside, E'…' with backslash escapes, $tag$…$tag$, "…", -- to the end of the line, nested /* … *\/);
 * null when one of them is not closed.
 */
export function bareOf(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      i = end < 0 ? sql.length : end;
      out += ' ';
    } else if (c === '/' && next === '*') {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++;
          i += 2;
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth) return null;
      out += ' ';
    } else if (c === "'" || ((c === 'e' || c === 'E') && next === "'" && !/[\w$]/.test(sql[i - 1] ?? ''))) {
      const escapes = c !== "'";
      i += escapes ? 2 : 1;
      let closed = false;
      while (i < sql.length) {
        if (escapes && sql[i] === '\\') i += 2;
        else if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") {
          i++;
          closed = true;
          break;
        } else i++;
      }
      if (!closed) return null;
      out += "''";
    } else if (c === '"') {
      i++;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') i += 2;
        else if (sql[i] === '"') {
          i++;
          closed = true;
          break;
        } else i++;
      }
      if (!closed) return null;
      out += '""';
    } else if (c === '$' && /^\$(?:[A-Za-z_]\w*)?\$/.test(sql.slice(i)) && !/[\w$]/.test(sql[i - 1] ?? '')) {
      const tag = sql.slice(i).match(/^\$(?:[A-Za-z_]\w*)?\$/)[0];
      const end = sql.indexOf(tag, i + tag.length);
      if (end < 0) return null;
      i = end + tag.length;
      out += "''";
    } else {
      out += c;
      i++;
    }
  }
  return out.trim();
}

/** Why a statement may not run, or null when it is a read */
export function refusal(sql) {
  const trimmed = sql.trim();
  if (trimmed.startsWith('\\')) return DESCRIBE.test(trimmed) ? null : 'only a \\d describe command, alone';
  const bare = bareOf(sql);
  if (bare == null) return 'a string, a quoted name or a comment is not closed';
  // one statement per argument: a trailing semicolon at most
  const statement = bare.replace(/;\s*$/, '').trim();
  if (!statement) return 'empty statement';
  if (statement.includes(';')) return 'one statement per argument';
  if (/\\/.test(statement)) return 'psql meta-commands are not allowed inside a query';
  if (!READ.test(statement)) return `not a query: ${statement.split(/\s/)[0]}`;
  if (/^explain\b/i.test(statement) && /\banalyze\b/i.test(statement)) return 'EXPLAIN ANALYZE runs the statement';
  const m = statement.match(WRITE);
  if (m) return `"${m[1]}" is not allowed in a read`;
  return null;
}

function psql(user, extra) {
  return spawnSync(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', user, '-d', 'marksy', '-v', 'ON_ERROR_STOP=1', '-X', ...extra],
    {
      stdio: ['ignore', 'inherit', 'inherit'],
    },
  );
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
  // the read role and its grants (tables added by a migration since the last run get SELECT too)
  const setup = psql('marksy', ['-q', '-c', ROLE_SETUP]);
  if (setup.error) {
    console.error(`db:read: ${setup.error.message} (is Docker Desktop running? pnpm db:up)`);
    return 1;
  }
  if (setup.status !== 0) return setup.status ?? 1;
  const r = psql(READ_ROLE, [...(tuples ? ['-At'] : []), ...sqls.flatMap((sql) => ['-c', sql])]);
  return r.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
