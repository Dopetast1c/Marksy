import { statfs } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readSettings } from './config';
import type { Settings } from './config';
import { dockerClient } from './docker';
import { startGuard } from './guard';
import { stateStore } from './history';
import type { Attempt } from './history';
import { createNudgeChecker } from './hook';
import { errorText, log } from './log';
import { createUpdater } from './procedure';
import type { CheckResult, ServerApi, Updater } from './procedure';
import { commit, replace, restore } from './recreate';
import { registryClient } from './registry';
import { cosignVerifier } from './verify';

// marksy-updater <command> (docs/running.md, updates):
//   updater          the service: polls the registry, takes the hook, updates; control on 127.0.0.1 only
//   socket-guard     the guard in front of the Docker socket
//   swap <id>        a one-off container that replaces the updater with its new image
//   status | history [n] | pause | resume | now [--to X.Y.Z]   talk to the running updater (docker compose exec)
//   healthcheck

const VERSION = process.env.MARKSY_VERSION ?? 'dev';

/** The M9 alert attaches here: every failed or refused update passes through once */
export function onUpdateFailed(a: Attempt): void {
  log.error('update needs attention', { from: a.from, to: a.to, outcome: a.outcome });
}

function serverApi(s: Settings): ServerApi {
  const auth = { authorization: `Bearer ${s.internalToken}` };
  const timeout = () => AbortSignal.timeout(10_000);
  return {
    async hold(minutes) {
      const res = await fetch(`${s.serverInternalUrl}/internal/hold`, {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({ minutes }),
        signal: timeout(),
      });
      if (!res.ok) throw new Error(`hold: ${res.status}`);
    },
    async status() {
      const res = await fetch(`${s.serverInternalUrl}/internal/status`, { headers: auth, signal: timeout() });
      if (!res.ok) throw new Error(`status: ${res.status}`);
      return (await res.json()) as Awaited<ReturnType<ServerApi['status']>>;
    },
    async health() {
      const res = await fetch(`${s.serverUrl}/api/health`, { signal: timeout() });
      return res.ok ? ((await res.json()) as { status: string; version: string; commit: string }) : null;
    },
  };
}

async function takeBackup(s: Settings, from: string, to: string): Promise<string> {
  const res = await fetch(`${s.backupUrl}/backup`, {
    method: 'POST',
    headers: { authorization: `Bearer ${s.internalToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'pre-update', from, to }),
    signal: AbortSignal.timeout(30 * 60_000),
  });
  const body = (await res.json().catch(() => ({}))) as { file?: string; error?: string };
  if (!res.ok || !body.file) throw new Error(body.error ?? `backup service: ${res.status}`);
  return body.file;
}

async function freeMb(dir: string): Promise<number | null> {
  try {
    const s = await statfs(dir);
    return Math.floor((s.bavail * s.bsize) / 1_048_576);
  } catch {
    log.warn('free space unknown');
    return null;
  }
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (c: Buffer) => {
      body += c.toString('utf8');
      if (body.length > limit) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function service(s: Settings): Promise<void> {
  const docker = dockerClient(s.guardUrl);
  const store = stateStore(s.stateDir);
  const self = await docker.inspectContainer(process.env.HOSTNAME ?? '');
  const project = self?.Config.Labels?.['com.docker.compose.project'];
  if (!self || !project) throw new Error('the updater must run as a service of the Marksy compose project');
  const updater: Updater = createUpdater(
    {
      prefix: s.prefix,
      channel: s.channel,
      project,
      quiet: s.quiet,
      pausedByEnv: s.paused,
      healthTimeoutMs: s.healthTimeoutMs,
      collectorWaitMs: s.collectorWaitMs,
      minFreeMb: s.minFreeMb,
      selfId: self.Id,
      guardUrl: s.guardUrl,
    },
    {
      docker,
      registry: registryClient(s.prefix),
      verify: cosignVerifier({ testKey: s.testKey }),
      server: serverApi(s),
      backup: (from, to) => takeBackup(s, from, to),
      store,
      freeMb: () => freeMb(s.stateDir),
      onFailed: onUpdateFailed,
      now: Date.now,
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    },
  );

  let last: CheckResult | null = null;
  let again = false;
  let timer: NodeJS.Timeout | undefined;
  const run = async (trigger: Attempt['trigger'], to?: string): Promise<CheckResult | null> => {
    if (updater.busy) {
      again = true;
      return null;
    }
    const r = await updater.check(trigger, to);
    if (r) last = r;
    if (again) {
      again = false;
      void run(trigger);
    }
    return r;
  };
  const schedule = () => {
    clearTimeout(timer);
    // 0 to 20 % later than the interval, so that hosts never ask at the same second
    timer = setTimeout(() => void run('poll').finally(schedule), s.pollMs * (1 + Math.random() * 0.2));
  };
  schedule();
  setTimeout(() => void run('start'), 30_000).unref();

  // the hook, routed by the proxy: it only says "check now"
  const nudge = createNudgeChecker(s.hookSecret);
  createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/health') return send(res, 200, { status: 'ok' });
    if (req.method !== 'POST' || !req.url?.startsWith('/_marksy/update-hook')) return send(res, 404, {});
    readBody(req, 4096).then(
      (body) => {
        const h = (name: string) => {
          const v = req.headers[name];
          return Array.isArray(v) ? v[0] : v;
        };
        const verdict = nudge({ timestamp: h('x-marksy-timestamp'), signature: h('x-marksy-signature') }, body);
        if (verdict !== 'ok') {
          log.warn('nudge refused', { verdict });
          return send(res, verdict === 'too_many' ? 429 : 401, { accepted: false });
        }
        log.info('nudge accepted');
        send(res, 202, { accepted: true });
        void run('hook');
      },
      () => send(res, 413, { accepted: false }),
    );
  }).listen(s.hookPort, '0.0.0.0', () => log.info('hook on', { port: s.hookPort }));

  // control, inside the container only: docker compose exec updater marksy-updater <command>
  createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://local');
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
      if (req.method === 'GET' && url.pathname === '/status') {
        const containers = await docker.listContainers(project).catch(() => []);
        const memory: Record<string, number | null> = {};
        for (const c of containers) {
          const name = c.Labels['com.docker.compose.service'] ?? c.Names[0] ?? c.Id;
          memory[name] = await docker.memory(c.Id).catch(() => null);
        }
        return send(res, 200, {
          updater: VERSION,
          channel: s.channel,
          paused: s.paused || (await store.paused()),
          quietHours: process.env.UPDATE_QUIET_HOURS || null,
          busy: updater.busy,
          last,
          memoryMb: Object.fromEntries(
            Object.entries(memory).map(([k, v]) => [k, v === null ? null : Math.round(v / 1_048_576)]),
          ),
          recent: await store.list(5),
        });
      }
      if (req.method === 'GET' && url.pathname === '/history')
        return send(res, 200, await store.list(Number(url.searchParams.get('n')) || 20));
      if (req.method === 'POST' && (url.pathname === '/pause' || url.pathname === '/resume')) {
        await store.setPaused(url.pathname === '/pause');
        return send(res, 200, { paused: url.pathname === '/pause' });
      }
      if (req.method === 'POST' && url.pathname === '/now') {
        const to = url.searchParams.get('to') ?? undefined;
        const r = await run('manual', to);
        return send(res, 200, r ?? { outcome: 'busy' });
      }
      send(res, 404, {});
    })().catch((err: unknown) => send(res, 500, { error: errorText(err) }));
  }).listen(s.controlPort, '127.0.0.1');
  log.info('updater started', { version: VERSION, channel: s.channel });
}

/** The one-off swap container: replaces the updater with its new image and goes */
async function swap(s: Settings, id: string): Promise<void> {
  const docker = dockerClient(s.guardUrl);
  const old = await docker.inspectContainer(id);
  if (!old) throw new Error('no updater container to replace');
  const ref = `${s.prefix}updater:${s.channel}`;
  const image = await docker.inspectImage(ref);
  if (!image) throw new Error('the new updater image is missing');
  if (old.Image === image.Id) return;
  const { replaced, ok } = await replace(docker, old.Id, ref, image.Id, {
    timeoutMs: 120_000,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: Date.now,
  });
  if (ok) {
    await commit(docker, replaced);
    log.info('updater replaced', { version: image.Config.Labels?.['org.opencontainers.image.version'] ?? null });
  } else {
    await restore(docker, replaced);
    log.error('the new updater did not start; the old one runs again');
  }
}

async function control(path: string, method = 'GET'): Promise<void> {
  const res = await fetch(`http://127.0.0.1:8091${path}`, { method, signal: AbortSignal.timeout(60 * 60_000) });
  process.stdout.write(`${JSON.stringify(await res.json(), null, 2)}\n`);
  if (!res.ok) process.exitCode = 1;
}

async function main(argv: string[]): Promise<void> {
  const [command = 'updater', ...rest] = argv;
  switch (command) {
    case 'updater':
      return service(readSettings());
    case 'socket-guard': {
      const s = readSettings({ ...process.env, UPDATE_CHANNEL: process.env.UPDATE_CHANNEL || '1' });
      startGuard({
        socketPath: '/var/run/docker.sock',
        port: Number(process.env.GUARD_PORT) || 2375,
        prefix: s.prefix,
      });
      return;
    }
    case 'swap':
      return swap(readSettings(), rest[0] ?? '');
    case 'status':
      return control('/status');
    case 'history':
      return control(`/history?n=${Number(rest[0]) || 20}`);
    case 'pause':
    case 'resume':
      return control(`/${command}`, 'POST');
    case 'now': {
      const at = rest.indexOf('--to');
      const to = at >= 0 ? rest[at + 1] : undefined;
      return control(`/now${to ? `?to=${encodeURIComponent(to)}` : ''}`, 'POST');
    }
    case 'healthcheck': {
      const port = rest[0] === 'guard' ? Number(process.env.GUARD_PORT) || 2375 : 8091;
      const path = rest[0] === 'guard' ? '/_ping' : '/health';
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5000) }).catch(
        () => null,
      );
      process.exitCode = res?.ok ? 0 : 1;
      return;
    }
    default:
      process.stderr.write(`unknown command ${command}\n`);
      process.exitCode = 2;
  }
}

main(process.argv.slice(2)).catch((err: unknown) => {
  log.error('stopped', { reason: errorText(err) });
  process.exit(1);
});
