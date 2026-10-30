#!/usr/bin/env node
// `pnpm migrations:compat` (CI): the previous release still works on the schema this commit migrates to, so the
// updater can always roll back by starting the previous image on it (CLAUDE.md, "Migrations").
//   1. the previous release: the newest tag vX.Y.Z before this commit; until the first release, main before this
//      change (the merge base with origin/main, or the first parent on main itself)
//   2. nothing to do when this commit adds no migration
//   3. a fresh database next to the test database: this commit's migrations, then the fictional demo family
//   4. the previous release's server on it: its image (a tag) or its code from a git worktree (before the first tag)
//   5. health, the demo parent's sign-in and the core read routes of every child, which every release has
// Needs TEST_DATABASE_URL's server (pnpm db:up, or the CI service) and, for a tag, Docker. Prints statuses and counts.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const root = fileURLToPath(new URL('..', import.meta.url));
const IMAGE = 'ghcr.io/dopetast1c/marksy-server';
const PORT = 3199;
const DB_NAME = 'marksy_compat';
// the seed's demo parent (server/src/seed/seed.ts, DEMO_LOGINS and DEMO_PASSWORD); fictional and published
const DEMO = { login: 'parent@example.com', password: 'marksy-demo' };
// read routes every release since the first has
export const CORE_ROUTES = ['overview', 'marks?period=quarter', 'subjects?period=quarter', 'schedule', 'periods'];

function git(args, opts = {}) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', ...opts });
  return r.status === 0 ? r.stdout.trim() : null;
}

/** The commit or tag the check runs the previous release from */
export function previousRelease() {
  const tag = git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*.[0-9]*.[0-9]*', 'HEAD^']);
  if (tag) return { ref: tag, version: tag.slice(1), image: true };
  const head = git(['rev-parse', 'HEAD']);
  const base = git(['merge-base', 'origin/main', 'HEAD']);
  const ref = !base || base === head ? git(['rev-parse', 'HEAD^']) : base;
  return { ref, version: null, image: false };
}

const MIGRATION = /^\d{4}_.*\.sql$/;

/** Migration files of the working tree that the previous release had not */
export function newMigrations(ref) {
  const before = new Set(
    (git(['ls-tree', '--name-only', ref, 'server/drizzle/']) ?? '').split('\n').map((p) => p.split('/').pop()),
  );
  return readdirSync(join(root, 'server', 'drizzle')).filter((f) => MIGRATION.test(f) && !before.has(f));
}

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(' ')} failed`);
}

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  }
}

async function waitHealthy(base, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const r = await fetch(`${base}/api/health`).catch(() => null);
    if (r?.ok) return (await r.json()).version ?? 'unknown';
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return null;
}

/** Health, the demo sign-in and the core read routes; returns the problems */
export async function walk(base, log = console.log) {
  const problems = [];
  let cookie = '';
  const get = async (path, init = {}) => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(cookie && { cookie }), ...(init.body && { 'content-type': 'application/json' }) },
    });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    return { status: res.status, body, setCookie: res.headers.getSetCookie?.() ?? [] };
  };
  const expect = (label, r, status = 200) => {
    const ok = r.status === status;
    log(`${ok ? 'ok ' : 'BAD'} ${r.status} ${label}`);
    if (!ok) problems.push(`${label}: ${r.status}, expected ${status}`);
    return ok;
  };
  expect('GET /api/health', await get('/api/health'));
  const login = await get('/api/auth/login', { method: 'POST', body: JSON.stringify(DEMO) });
  if (!expect('POST /api/auth/login (the demo parent)', login)) return problems;
  cookie = (login.setCookie.find((c) => c.startsWith('marksy_session=')) ?? '').split(';')[0];
  const students = await get('/api/students');
  expect('GET /api/students', students);
  const children = Array.isArray(students.body) ? students.body : [];
  if (!children.length) problems.push('the demo family has no children');
  for (const [i, child] of children.entries())
    for (const route of CORE_ROUTES)
      expect(`GET child ${i + 1}/${route}`, await get(`/api/students/${encodeURIComponent(child.id)}/${route}`));
  return problems;
}

async function main() {
  const test = process.env.TEST_DATABASE_URL ?? 'postgres://marksy:marksy@localhost:5434/marksy_test';
  const prev = previousRelease();
  if (!prev.ref) {
    console.error('migrations:compat: no previous release or main to compare with');
    return 2;
  }
  const added = newMigrations(prev.ref);
  if (!added.length) {
    console.log(`migrations:compat: no new migration since ${prev.ref.slice(0, 12)}, nothing to check`);
    return 0;
  }
  console.log(`migrations:compat: ${added.join(', ')} against ${prev.version ?? prev.ref.slice(0, 12)}`);

  const adminUrl = Object.assign(new URL(test), { pathname: '/postgres' }).toString();
  const dbUrl = Object.assign(new URL(test), { pathname: `/${DB_NAME}` }).toString();
  const admin = async (sql) => {
    const c = new pg.Client({ connectionString: adminUrl });
    await c.connect();
    try {
      await c.query(sql);
    } finally {
      await c.end();
    }
  };
  await admin(`drop database if exists ${DB_NAME} with (force)`);
  await admin(`create database ${DB_NAME}`);

  const env = { ...process.env, DATABASE_URL: dbUrl, PUBLIC_URL: '' };
  let server;
  let worktree;
  let container;
  try {
    run('pnpm', ['--filter', '@marksy/server', 'db:migrate'], { cwd: root, env });
    run('pnpm', ['--filter', '@marksy/server', 'db:seed'], { cwd: root, env });

    const serverEnv = {
      DATABASE_URL: dbUrl,
      SESSION_SECRET: randomBytes(32).toString('hex'),
      CREDENTIALS_KEY: randomBytes(32).toString('base64'),
      SYNC_ENABLED: 'false',
      PORT: String(PORT),
      HOST: '127.0.0.1',
    };
    if (prev.image) {
      container = `marksy-compat-${process.pid}`;
      run('docker', [
        'run',
        '-d',
        '--rm',
        '--name',
        container,
        '--network',
        'host',
        ...Object.entries(serverEnv).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
        `${IMAGE}:${prev.version}`,
      ]);
    } else {
      worktree = mkdtempSync(join(tmpdir(), 'marksy-compat-'));
      run('git', ['worktree', 'add', '--detach', worktree, prev.ref], { cwd: root });
      run('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts'], { cwd: worktree });
      server = spawn('pnpm', ['--filter', '@marksy/server', 'exec', 'tsx', 'src/main.ts'], {
        cwd: worktree,
        env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...serverEnv },
        stdio: ['ignore', 'inherit', 'inherit'],
        detached: process.platform !== 'win32',
        shell: process.platform === 'win32',
      });
    }
    const base = `http://127.0.0.1:${PORT}`;
    const version = await waitHealthy(base, 120_000);
    if (!version) {
      console.error('migrations:compat: the previous release did not start on the migrated schema');
      return 1;
    }
    console.log(`the previous release (${version}) runs on the migrated schema`);
    const problems = await walk(base);
    if (problems.length) {
      console.error(`migrations:compat: ${problems.length} problem(s); the previous release breaks on this schema`);
      for (const p of problems) console.error(`  - ${p}`);
      return 1;
    }
    console.log('migrations:compat: ok');
    return 0;
  } finally {
    killTree(server);
    if (container) spawnSync('docker', ['stop', container], { stdio: 'ignore' });
    if (worktree) {
      spawnSync('git', ['worktree', 'remove', '--force', worktree], { cwd: root, stdio: 'ignore' });
      rmSync(worktree, { recursive: true, force: true });
    }
    await admin(`drop database if exists ${DB_NAME} with (force)`).catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main();
