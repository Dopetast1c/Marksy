#!/usr/bin/env node
// The updater end to end (.github/workflows/updater-e2e.yml; Linux with Docker and cosign, never on a host that runs
// Marksy): the production compose file on a registry on localhost, releases built FROM this commit's images and signed
// with a test key, and every promise of docs/running.md, "Updates", checked against the real updater:
//   a pinned channel stays; channel 1.1 takes 1.1.1 but not 1.2.0, within about two minutes of a signed nudge;
//   unsigned, stale and replayed nudges are refused; channel 1 takes 1.2.0 by polling but never 2.0.0;
//   nothing installs inside quiet hours or while a collector run is open, and such an attempt takes no backup and
//   is not tried again within the hour, while `update now` installs it with one backup;
//   a release that never becomes healthy and one whose migration fails are rolled back, the schema unchanged, and
//   a rolled-back release is not tried again by itself;
//   an unsigned image and one signed by another key are refused; the updater replaces itself.
// Expects the images marksy-server:e2e, marksy-web:e2e and marksy-updater:e2e (built by the workflow) and cosign on
// PATH. Prints versions, outcomes and timings; the history of the updater is printed at the end.
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const REG = 'localhost:5000';
const PREFIX = `${REG}/marksy-`;
const PROJECT = 'marksy-e2e';
const PORT = 8088;
const HOOK = `http://localhost:${PORT}/_marksy/update-hook`;
const work = mkdtempSync(join(tmpdir(), 'marksy-e2e-'));
let channel = '1.0.0';
let failures = 0;

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', cwd: work, maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0 && !opts.ok) {
    process.stderr.write(r.stdout ?? '');
    process.stderr.write(r.stderr ?? '');
    throw new Error(`${cmd} ${args.slice(0, 4).join(' ')} failed`);
  }
  return (r.stdout ?? '').trim();
}

const compose = (args, opts = {}) =>
  sh(
    'docker',
    [
      'compose',
      '-p',
      PROJECT,
      '--env-file',
      '.env.production',
      '-f',
      'docker-compose.prod.yml',
      '-f',
      'docker-compose.e2e.yml',
      ...args,
    ],
    { ...opts, env: { ...process.env, UPDATE_CHANNEL: channel, PROXY_PORT: String(PORT), ...opts.env } },
  );

const step = (text) => console.log(`\n== ${text}`);
function check(ok, text) {
  console.log(`${ok ? 'ok ' : 'BAD'} ${text}`);
  if (!ok) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The version the running server reports */
async function serverVersion() {
  // init-env's BASE_PATH; the hook stays at the root
  const r = await fetch(`http://localhost:${PORT}/marksy/api/health`).catch(() => null);
  return r?.ok ? (await r.json()).version : null;
}

async function waitFor(what, test, ms) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await test()) return Date.now() - start;
    await sleep(3000);
  }
  console.log(`   (gave up waiting for ${what} after ${ms / 1000} s)`);
  return null;
}

const updaterCli = (args) => JSON.parse(compose(['exec', '-T', 'updater', 'marksy-updater', ...args]) || 'null');
const history = () => updaterCli(['history', '50']) ?? [];
const lastOutcome = () => history().at(-1)?.outcome ?? null;
const psql = (sql) => compose(['exec', '-T', 'postgres', 'psql', '-U', 'marksy', '-d', 'marksy', '-tAc', sql]).trim();

// --- releases ---

function build(name, version, extra = '', context = null) {
  const dir = context ?? mkdtempSync(join(work, 'ctx-'));
  writeFileSync(
    join(dir, 'Dockerfile'),
    [
      `FROM marksy-${name}:e2e`,
      `ENV MARKSY_VERSION=${version} MARKSY_COMMIT=rev-${version}`,
      `LABEL org.opencontainers.image.version=${version} org.opencontainers.image.revision=rev-${version}${name === 'web' ? ' marksy.proxy-config=e2e' : ''}`,
      extra,
    ].join('\n'),
  );
  sh('docker', ['build', '-q', '-t', `${PREFIX}${name}:${version}`, dir]);
}

/** Pushes a version and its moving tags (X.Y, X, as release.yml does) and signs it unless told otherwise */
function publish(name, version, opts = {}) {
  const ref = `${PREFIX}${name}:${version}`;
  const [major, minor] = version.split('.');
  sh('docker', ['push', '-q', ref]);
  for (const tag of opts.moving === false ? [] : [`${major}.${minor}`, major]) {
    sh('docker', ['tag', ref, `${PREFIX}${name}:${tag}`]);
    sh('docker', ['push', '-q', `${PREFIX}${name}:${tag}`]);
  }
  const digest = sh('docker', ['inspect', '--format', '{{index .RepoDigests 0}}', ref]);
  if (opts.sign !== false)
    sh(
      'cosign',
      [
        'sign',
        '--yes',
        '--key',
        opts.key ?? join(work, 'keys', 'cosign.key'),
        '--tlog-upload=false',
        '--use-signing-config=false',
        '--allow-http-registry=true',
        digest,
      ],
      { env: { ...process.env, COSIGN_PASSWORD: '' } },
    );
  return digest;
}

function release(version, opts = {}) {
  for (const name of opts.only ?? ['server', 'web', 'updater']) {
    if (name === 'server' && opts.serverExtra) build(name, version, opts.serverExtra, opts.serverContext);
    else build(name, version);
    publish(name, version, opts);
  }
}

/** A signed nudge, as release.yml sends it */
async function nudge(
  secret,
  { timestamp = Math.floor(Date.now() / 1000), signature, body = '{"event":"release"}' } = {},
) {
  const ts = String(timestamp);
  const sig = signature ?? `sha256=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;
  const r = await fetch(HOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-marksy-timestamp': ts, 'x-marksy-signature': sig },
    body,
  });
  return r.status;
}

const env = (key) => sh('sh', ['-c', `sed -n 's/^${key}=//p' .env.production | tail -n 1`]);

async function main() {
  step('setting up');
  for (const f of ['docker-compose.prod.yml']) copyFileSync(join(root, f), join(work, f));
  copyFileSync(join(root, 'scripts', 'e2e', 'docker-compose.e2e.yml'), join(work, 'docker-compose.e2e.yml'));
  mkdirSync(join(work, 'keys'));
  // the backup service writes as the image's user, not as the user running this script
  mkdirSync(join(work, 'backups'), { mode: 0o777 });
  chmodSync(join(work, 'backups'), 0o777);
  sh('cosign', ['generate-key-pair'], { cwd: join(work, 'keys'), env: { ...process.env, COSIGN_PASSWORD: '' } });
  // another key: an image it signs must be refused
  mkdirSync(join(work, 'other'));
  sh('cosign', ['generate-key-pair'], { cwd: join(work, 'other'), env: { ...process.env, COSIGN_PASSWORD: '' } });
  const user = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;
  sh('docker', [
    'run',
    '--rm',
    '--user',
    user,
    '-v',
    `${work}:/work`,
    'marksy-server:e2e',
    'init-env',
    '/work/.env.production',
  ]);
  writeFileSync(join(work, '.env.production'), `\nBACKUP_DIR=./backups\n`, { flag: 'a' });
  const secret = env('UPDATE_HOOK_SECRET');

  compose(['up', '-d', 'registry']);
  await waitFor('the registry', async () => (await fetch(`http://${REG}/v2/`).catch(() => null))?.ok, 30_000);
  release('1.0.0');
  release('1.1.0');

  step('a pinned channel: the stack starts on 1.0.0 and stays');
  compose(['up', '-d', '--wait']);
  compose(['exec', '-T', 'server', 'node', '/app/dist/marksy.mjs', 'seed']);
  check((await serverVersion()) === '1.0.0', 'the server runs 1.0.0');
  await sleep(45_000);
  check((await serverVersion()) === '1.0.0', 'still 1.0.0 with channel 1.0.0 after the start check');

  step('channel 1.1: the start check installs 1.1.0');
  channel = '1.1';
  compose(['up', '-d', '--no-deps', 'updater']);
  const t11 = await waitFor('1.1.0', async () => (await serverVersion()) === '1.1.0', 180_000);
  check(t11 !== null, `1.1.0 installed (${t11 && Math.round(t11 / 1000)} s)`);

  step('the hook: refused unless signed, fresh and new');
  const ts = Math.floor(Date.now() / 1000);
  check((await nudge(secret, { signature: 'sha256=00' })) === 401, 'a wrong signature is refused');
  check((await nudge('another-secret')) === 401, 'another secret is refused');
  check((await nudge(secret, { timestamp: ts - 900 })) === 401, 'a stale nudge is refused');
  const fixed = { timestamp: ts };
  check((await nudge(secret, fixed)) === 202, 'a signed nudge is accepted');
  check((await nudge(secret, fixed)) === 401, 'the same nudge again is refused');

  step('a signed nudge brings 1.1.1 within about two minutes, not 1.2.0');
  release('1.1.1');
  release('1.2.0');
  // the last check may still run; a fresh nudge after it
  await sleep(5000);
  check((await nudge(secret)) === 202, 'nudge accepted');
  const tNudge = await waitFor('1.1.1', async () => (await serverVersion()) === '1.1.1', 180_000);
  check(
    tNudge !== null && tNudge < 150_000,
    `1.1.1 installed ${tNudge && Math.round(tNudge / 1000)} s after the nudge`,
  );
  check((await serverVersion()) !== '1.2.0', 'channel 1.1 did not take 1.2.0');
  const h1 = history().at(-1);
  console.log(`   downtime of the server: ${h1?.downtimeMs} ms, whole update ${h1?.durationMs} ms`);

  step('channel 1 picks 1.2.0 up by polling, never 2.0.0');
  channel = '1';
  release('2.0.0');
  compose(['up', '-d', '--no-deps', 'updater']);
  const tPoll = await waitFor('1.2.0', async () => (await serverVersion()) === '1.2.0', 300_000);
  check(tPoll !== null, `1.2.0 installed by polling (${tPoll && Math.round(tPoll / 1000)} s)`);
  await sleep(70_000);
  check((await serverVersion()) === '1.2.0', 'channel 1 did not take 2.0.0');

  // pre-update backups in BACKUP_DIR: one only for an attempt that got as far as the install
  const dumps = () => {
    try {
      return readdirSync(join(work, 'backups', 'pre-update')).filter((f) => f.endsWith('.dump')).length;
    } catch {
      return 0;
    }
  };
  const dumpsBefore = dumps();

  step('quiet hours and an open collector run hold 1.2.1 back');
  // without the updater image: `update now` below answers before a self-update could stop it
  release('1.2.1', { only: ['server', 'web'] });
  const hour = new Date().getHours();
  const quiet = `${String(hour).padStart(2, '0')}:00-${String((hour + 2) % 24).padStart(2, '0')}:00`;
  compose(['up', '-d', '--no-deps', 'updater'], { env: { UPDATE_QUIET_HOURS: quiet } });
  await sleep(80_000);
  check((await serverVersion()) === '1.2.0', `nothing installed inside quiet hours ${quiet}`);
  check(
    history().some((a) => a.to === '1.2.1' && a.outcome === 'waiting_quiet_hours'),
    'the history says it waits for quiet hours to end',
  );
  psql(`update sync_runs set status = 'running', started_at = now() where id = (select id from sync_runs limit 1)`);
  compose(['up', '-d', '--no-deps', 'updater'], {
    env: { UPDATE_QUIET_HOURS: '', UPDATE_COLLECTOR_WAIT_MINUTES: '1' },
  });
  await sleep(150_000);
  check((await serverVersion()) === '1.2.0', 'nothing installed while a collector run is open');
  check(
    history().some((a) => a.to === '1.2.1' && a.outcome === 'waiting_collector'),
    'the history says it waits for the collector',
  );
  psql(`update sync_runs set status = 'success' where status = 'running'`);

  step('rule 1: stopped before the install, tried again only after an hour; update now installs it');
  await sleep(130_000);
  check((await serverVersion()) === '1.2.0', 'two polls with the collector free: not tried again within the hour');
  check(
    history().filter((a) => a.to === '1.2.1' && a.outcome === 'waiting_collector').length === 1,
    'one attempt in the history',
  );
  check(dumps() === dumpsBefore, 'no pre-update backup by the attempts that stopped before the install');
  const manual = updaterCli(['now']);
  check(manual?.outcome === 'updated', `update now: ${manual?.outcome}`);
  check((await serverVersion()) === '1.2.1', 'the server runs 1.2.1');
  check(dumps() === dumpsBefore + 1, 'one pre-update backup, taken right before the install');

  const migrations = () => psql('select count(*) from drizzle.__drizzle_migrations');
  const before = migrations();

  step('rule 2: a release that never becomes healthy is rolled back, and never tried again by itself');
  release('1.3.0', {
    only: ['server', 'web'],
    serverExtra: 'ENTRYPOINT ["node", "-e", "setInterval(() => {}, 1000)"]',
  });
  await nudge(secret);
  await waitFor('the rollback of 1.3.0', async () => lastOutcome() === 'rolled_back', 300_000);
  check(lastOutcome() === 'rolled_back', 'the history says rolled back');
  check((await serverVersion()) === '1.2.1', 'the server runs 1.2.1 again');
  check(migrations() === before, 'the schema is unchanged');
  const dumpsAfterRollback = dumps();
  await sleep(130_000);
  check(history().filter((a) => a.to === '1.3.0').length === 1, 'two polls later: 1.3.0 not tried again');
  check(dumps() === dumpsAfterRollback, 'and no new backup');

  step('a release whose migration fails is rolled back, the schema unchanged');
  const ctx = mkdtempSync(join(work, 'ctx-'));
  writeFileSync(
    join(ctx, 'fail.mjs'),
    [
      "import { readFileSync, writeFileSync } from 'node:fs';",
      "const path = '/app/drizzle/meta/_journal.json';",
      'const j = JSON.parse(readFileSync(path, "utf8"));',
      'const last = j.entries.at(-1);',
      "j.entries.push({ ...last, idx: last.idx + 1, when: last.when + 1000, tag: '9999_e2e_fail' });",
      'writeFileSync(path, JSON.stringify(j));',
      `writeFileSync('/app/drizzle/9999_e2e_fail.sql', 'CREATE TABLE "e2e_half" ("id" integer);\\n--> statement-breakpoint\\nSELECT * FROM "no_such_table";');`,
    ].join('\n'),
  );
  release('1.3.1', {
    only: ['server', 'web'],
    serverContext: ctx,
    serverExtra: 'USER root\nCOPY fail.mjs /tmp/fail.mjs\nRUN node /tmp/fail.mjs && rm /tmp/fail.mjs\nUSER node',
  });
  await nudge(secret);
  await waitFor('the rollback of 1.3.1', async () => history().at(-1)?.to === '1.3.1', 300_000);
  check(history().at(-1)?.outcome === 'rolled_back', 'the history says rolled back');
  check((await serverVersion()) === '1.2.1', 'the server runs 1.2.1 again');
  check(migrations() === before, 'the migration count is unchanged');
  check(psql("select count(*) from information_schema.tables where table_name = 'e2e_half'") === '0', 'no half table');

  step('an unsigned image and one signed by another key are refused');
  release('1.3.2', { only: ['server', 'web'], sign: false });
  await nudge(secret);
  await waitFor('the refusal of 1.3.2', async () => history().at(-1)?.to === '1.3.2', 120_000);
  check(history().at(-1)?.outcome === 'refused_signature', 'unsigned 1.3.2 refused');
  release('1.3.3', { only: ['server', 'web'], key: join(work, 'other', 'cosign.key') });
  await nudge(secret);
  await waitFor('the refusal of 1.3.3', async () => history().at(-1)?.to === '1.3.3', 120_000);
  check(history().at(-1)?.outcome === 'refused_signature', '1.3.3 signed by another key refused');
  check((await serverVersion()) === '1.2.1', 'the server still runs 1.2.1');

  step('a good release, the updater included, and the updater replaces itself');
  release('1.4.0');
  await nudge(secret);
  const t14 = await waitFor('1.4.0', async () => (await serverVersion()) === '1.4.0', 300_000);
  check(t14 !== null, `1.4.0 installed (${t14 && Math.round(t14 / 1000)} s)`);
  const selfVersion = () => {
    try {
      return updaterCli(['status'])?.updater ?? null;
    } catch {
      // between the old updater and the new one
      return null;
    }
  };
  const tSelf = await waitFor('the new updater', async () => selfVersion() === '1.4.0', 180_000);
  check(tSelf !== null, `the updater replaced itself and runs ${selfVersion()}`);
  const last = history().at(-1);
  console.log(`   downtime of the server: ${last?.downtimeMs} ms, whole update ${last?.durationMs} ms`);
}

try {
  await main();
} catch (err) {
  failures++;
  console.error(`e2e stopped: ${err.message}`);
} finally {
  step('history');
  try {
    for (const a of history())
      console.log(`   ${a.at} ${a.trigger} ${a.from} -> ${a.to}: ${a.outcome}${a.reason ? ` (${a.reason})` : ''}`);
  } catch {
    console.log('   (no history)');
  }
  step('memory after the updates');
  const ids = compose(['ps', '-q'], { ok: true }).split('\n').filter(Boolean);
  if (ids.length)
    console.log(
      sh('docker', ['stats', '--no-stream', '--format', '   {{.Name}}: {{.MemUsage}}', ...ids], { ok: true }),
    );
  if (failures) compose(['logs', '--tail', '80', 'updater', 'socket-guard', 'server'], { ok: true, stdio: 'inherit' });
  compose(['down', '-v', '--remove-orphans'], { ok: true });
}
console.log(failures ? `\nupdater e2e: ${failures} problem(s)` : '\nupdater e2e: all green');
process.exitCode = failures ? 1 : 0;
