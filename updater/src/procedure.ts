import { channelTag, compareVersions, formatVersion, parseChannel, parseVersion, pickRelease } from './channel';
import type { ContainerSummary, Docker } from './docker';
import { KEEP } from './history';
import type { Attempt, StateStore } from './history';
import { errorText, log } from './log';
import { inQuietHours } from './quiet';
import type { QuietHours } from './quiet';
import { commit, replace, restore, waitReady } from './recreate';
import type { Replaced } from './recreate';
import type { Registry } from './registry';
import type { Verifier } from './verify';

// One update (docs/running.md, updates), in this order, and nothing is stopped before everything is ready:
//   find the release the channel allows -> check every image's signature -> wait out quiet hours -> hold the
//   collector and wait for a running read to end -> check the disk -> pull by digest and check the versions ->
//   take the pre-update backup -> move the channel's local tags -> replace server, backup, web (and the proxy when
//   its configuration changed), each healthy before the next -> keep the old containers until all are healthy, or
//   put them all back. A backup is taken only by an attempt that gets as far as the install.
// Then old images are pruned (the previous release stays for a rollback) and the updater replaces itself last,
// through a one-off swap container.

export const IMAGES = ['server', 'web', 'updater'] as const;
export type ImageName = (typeof IMAGES)[number];

/** service -> image; the order is the order of replacement */
export const SERVICES: [string, ImageName][] = [
  ['server', 'server'],
  ['backup', 'server'],
  ['web', 'web'],
  ['proxy', 'web'],
];

const VERSION_LABEL = 'org.opencontainers.image.version';
const REVISION_LABEL = 'org.opencontainers.image.revision';
const PROXY_LABEL = 'marksy.proxy-config';
const SERVICE_LABEL = 'com.docker.compose.service';

export interface UpdaterConfig {
  prefix: string;
  channel: string;
  project: string;
  quiet: QuietHours | null;
  pausedByEnv: boolean;
  healthTimeoutMs: number;
  collectorWaitMs: number;
  minFreeMb: number;
  selfId: string;
  guardUrl: string;
}

export interface ServerApi {
  hold(minutes: number): Promise<void>;
  status(): Promise<{ version: string; commit: string; migrations: number; sync: { running: number } }>;
  health(): Promise<{ status: string; version: string; commit: string } | null>;
}

export interface Deps {
  docker: Docker;
  registry: Registry;
  verify: Verifier;
  server: ServerApi;
  backup: (from: string, to: string) => Promise<string>;
  store: StateStore;
  freeMb: () => Promise<number | null>;
  onFailed: (a: Attempt) => void;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

export interface Target {
  /** a version, or the channel tag and a short digest for edge and preview */
  label: string;
  tag: string;
  kind: 'release' | 'edge' | 'preview';
  digests: Partial<Record<ImageName, string>>;
}

export type Trigger = Attempt['trigger'];

export interface CheckResult {
  at: string;
  running: string;
  available: string | null;
  outcome: Attempt['outcome'] | 'up_to_date' | 'error';
  reason?: string;
}

class Abort extends Error {
  constructor(
    readonly outcome: Attempt['outcome'],
    message: string,
  ) {
    super(message);
  }
}

export const RETRY_AFTER_FAILURE_MS = 60 * 60_000;
/** Outcomes that stopped before the install or during it for a reason other than health: tried again after an hour */
const RETRY_LATER: Attempt['outcome'][] = ['failed', 'waiting_collector', 'refused_signature'];

const short = (digest: string) => digest.replace(/^sha256:/, '').slice(0, 12);

export function createUpdater(cfg: UpdaterConfig, deps: Deps) {
  const { docker, registry, store } = deps;
  const channel = parseChannel(cfg.channel);
  const localTag = channelTag(cfg.channel);
  const noticed = new Set<string>();
  let busy = false;

  const iso = () => new Date(deps.now()).toISOString();
  const repo = (img: ImageName) => `${cfg.prefix}${img}`;

  async function containers(): Promise<Map<string, ContainerSummary>> {
    const list = await docker.listContainers(cfg.project);
    const map = new Map<string, ContainerSummary>();
    for (const c of list) {
      const service = c.Labels[SERVICE_LABEL];
      // a parked old container (an interrupted update) is not the service
      if (service && !c.Names.some((n) => n.endsWith('-previous'))) map.set(service, c);
    }
    return map;
  }

  async function running(byService: Map<string, ContainerSummary>) {
    const server = byService.get('server');
    if (!server) throw new Error('no server container in this project');
    const image = await docker.inspectImage(server.ImageID);
    return {
      version: image?.Config.Labels?.[VERSION_LABEL] ?? 'unknown',
      digests: image?.RepoDigests ?? [],
    };
  }

  async function findTarget(current: { version: string; digests: string[] }, to?: string): Promise<Target | null> {
    if (channel.kind === 'digest' && !to) {
      const digests: Target['digests'] = {};
      for (const img of IMAGES) {
        const d = await registry.digest(img, channel.tag);
        if (d) digests[img] = d;
      }
      if (!digests.server || !digests.web) return null;
      if (current.digests.includes(`${repo('server')}@${digests.server}`)) return null;
      return { label: `${channel.tag}@${short(digests.server)}`, tag: channel.tag, kind: channel.tag, digests };
    }
    const runningVersion = parseVersion(current.version);
    const [server, web] = await Promise.all([registry.tags('server'), registry.tags('web')]);
    const both = server.filter((t) => web.includes(t));
    let pick;
    if (to) {
      const wanted = parseVersion(to);
      if (!wanted || !both.includes(formatVersion(wanted))) throw new Abort('failed', `no release ${to}`);
      if (runningVersion && compareVersions(wanted, runningVersion) <= 0)
        throw new Abort('failed', `${to} is not newer than ${current.version}`);
      pick = wanted;
    } else pick = pickRelease(channel, runningVersion, both);
    if (!pick) return null;
    const tag = formatVersion(pick);
    const digests: Target['digests'] = {};
    for (const img of IMAGES) {
      const d = await registry.digest(img, tag);
      if (d) digests[img] = d;
    }
    if (!digests.server || !digests.web) return null;
    return { label: tag, tag, kind: 'release', digests };
  }

  async function waitForCollector(): Promise<boolean> {
    const until = deps.now() + cfg.collectorWaitMs;
    for (;;) {
      const s = await deps.server.status();
      if (s.sync.running === 0) return true;
      if (deps.now() >= until) return false;
      await deps.sleep(15_000);
    }
  }

  /** Removes Marksy images no container uses, except the ones named (the release before stays for a rollback) */
  async function prune(keep: Set<string>): Promise<void> {
    const used = new Set((await docker.listContainers(cfg.project)).map((c) => c.ImageID));
    for (const img of await docker.listImages()) {
      if (keep.has(img.Id) || used.has(img.Id)) continue;
      const tags = (img.RepoTags ?? []).filter((t) => !t.startsWith('<none>'));
      for (const t of tags) await docker.removeImage(t).catch(() => undefined);
      if (!tags.length) await docker.removeImage(img.Id).catch(() => undefined);
    }
  }

  async function launchSwap(): Promise<void> {
    const self = await docker.inspectContainer(cfg.selfId);
    if (!self) throw new Error('cannot see the updater container');
    const network = Object.keys(self.NetworkSettings.Networks).find((n) => n.endsWith('_docker'));
    const name = `${cfg.project}-updater-swap`;
    const stale = await docker.inspectContainer(name);
    if (stale) await docker.remove(stale.Id);
    const id = await docker.create(name, {
      Image: `${repo('updater')}:${localTag}`,
      Cmd: ['swap', self.Id],
      Env: [`DOCKER_GUARD_URL=${cfg.guardUrl}`, `UPDATE_IMAGE_PREFIX=${cfg.prefix}`, `UPDATE_CHANNEL=${cfg.channel}`],
      Labels: { 'marksy.updatable': 'true', 'com.docker.compose.project': cfg.project },
      HostConfig: { AutoRemove: true, ...(network && { NetworkMode: network }) },
    });
    await docker.start(id);
  }

  async function update(trigger: Trigger, to?: string): Promise<CheckResult> {
    const startedAt = deps.now();
    const byService = await containers();
    const current = await running(byService);
    const result = (r: Omit<CheckResult, 'at' | 'running'>): CheckResult => ({
      at: iso(),
      running: current.version,
      ...r,
    });
    const manual = trigger === 'manual';
    if (!manual && (cfg.pausedByEnv || (await store.paused()))) return result({ available: null, outcome: 'paused' });

    const target = await findTarget(current, to);
    if (!target) return result({ available: null, outcome: 'up_to_date' });
    const attempt = (outcome: Attempt['outcome'], extra: Partial<Attempt> = {}): Attempt => ({
      at: iso(),
      trigger,
      channel: cfg.channel || '1',
      from: current.version,
      to: target.label,
      outcome,
      digests: Object.fromEntries(Object.entries(target.digests).map(([k, d]) => [k, short(d)])),
      ...extra,
    });
    const once = async (key: string, a: Attempt) => {
      if (noticed.has(key)) return;
      noticed.add(key);
      await store.append(a);
    };

    // Two rules decide whether this release is tried again by itself; `marksy update now` ignores both, and a newer
    // release is always tried:
    //   installed and rolled back because it did not become healthy (a failing migration included): never again;
    //   stopped before or during the install for any other reason (a signature not found, the disk, a pull, the
    //   backup, a busy collector, Docker): again an hour after the last try.
    const shortKey = JSON.stringify(attempt('updated').digests);
    if (!manual) {
      const same = (await store.list(KEEP)).filter((a) => JSON.stringify(a.digests) === shortKey);
      if (same.some((a) => a.outcome === 'rolled_back'))
        return result({ available: target.label, outcome: 'rolled_back', reason: 'rolled back before' });
      const last = same.filter((a) => RETRY_LATER.includes(a.outcome)).at(-1);
      if (last && deps.now() - Date.parse(last.at) < RETRY_AFTER_FAILURE_MS)
        return result({ available: target.label, outcome: last.outcome, reason: 'tried less than an hour ago' });
    }

    // 1. signatures, before anything is pulled; a refusal is checked again an hour later (rule 1), since a release
    // being published may be found a moment before its signature
    const key = Object.values(target.digests).join(',');
    try {
      for (const img of IMAGES) {
        const d = target.digests[img];
        if (d) await deps.verify(`${repo(img)}@${d}`, target.kind);
      }
    } catch (err) {
      const a = attempt('refused_signature', { reason: errorText(err) });
      await store.append(a);
      deps.onFailed(a);
      log.error('update refused', { to: target.label, reason: a.reason });
      return result({ available: target.label, outcome: 'refused_signature', reason: a.reason });
    }

    // 2. quiet hours (a manual update ignores them)
    if (!manual && inQuietHours(cfg.quiet, new Date(deps.now()))) {
      await once(`quiet:${key}`, attempt('waiting_quiet_hours'));
      return result({ available: target.label, outcome: 'waiting_quiet_hours' });
    }

    // 3. no collector run during the update
    await deps.server.hold(30);
    if (!(await waitForCollector())) {
      await deps.server.hold(0);
      await store.append(attempt('waiting_collector'));
      return result({ available: target.label, outcome: 'waiting_collector' });
    }

    const done: Replaced[] = [];
    const moved: [ImageName, string][] = [];
    const ids: Partial<Record<ImageName, { id: string; labels: Record<string, string> }>> = {};
    let backup: string | undefined;
    let before = 0;
    let downtimeMs: number | undefined;
    try {
      // 4. the disk, then every image pulled and checked: nothing stops and no backup is taken before this succeeds
      const free = await deps.freeMb();
      if (free !== null && free < cfg.minFreeMb) throw new Abort('failed', `only ${free} MB free on the disk`);
      for (const img of IMAGES) {
        const d = target.digests[img];
        if (!d) continue;
        const ref = `${repo(img)}@${d}`;
        await docker.pull(ref);
        const inspected = await docker.inspectImage(ref);
        if (!inspected) throw new Abort('failed', `pulled ${img} is missing`);
        const labels = inspected.Config.Labels ?? {};
        if (target.kind === 'release' && labels[VERSION_LABEL] !== target.tag)
          throw new Abort('failed', `${img} says version ${labels[VERSION_LABEL] ?? 'none'}, not ${target.tag}`);
        ids[img] = { id: inspected.Id, labels };
      }

      // 5. the backup, right before the install
      before = (await deps.server.status()).migrations;
      try {
        backup = await deps.backup(current.version, target.label);
      } catch (err) {
        throw new Abort('failed', `backup: ${errorText(err)}`);
      }

      // 6. the channel's local tag follows the release, so that `docker compose up` keeps it
      for (const img of IMAGES) {
        const now = ids[img];
        if (!now) continue;
        const before = (await docker.inspectImage(`${repo(img)}:${localTag}`))?.Id;
        await docker.tag(now.id, repo(img), localTag);
        if (before && before !== now.id) moved.push([img, before]);
      }

      // 7. replace, server first
      const newRevision = ids.server!.labels[REVISION_LABEL];
      for (const [service, img] of SERVICES) {
        const c = byService.get(service);
        const next = ids[img];
        if (!c || !next || c.ImageID === next.id) continue;
        if (service === 'proxy') {
          const old = await docker.inspectImage(c.ImageID);
          const was = old?.Config.Labels?.[PROXY_LABEL];
          if (was && was === next.labels[PROXY_LABEL]) continue;
        }
        const t0 = deps.now();
        const r = await replace(docker, c.Id, `${repo(img)}:${localTag}`, next.id, {
          timeoutMs: cfg.healthTimeoutMs,
          sleep: deps.sleep,
          now: deps.now,
          ...(service === 'server' && {
            check: async () => (await deps.server.health().catch(() => null))?.commit === newRevision,
          }),
        });
        done.push(r.replaced);
        if (!r.ok) throw new Abort('rolled_back', `${service} did not become healthy`);
        if (service === 'server') downtimeMs = deps.now() - t0;
      }
    } catch (err) {
      // only a container that did not become healthy makes a rollback for good; any other error (Docker, the network)
      // puts back what was replaced too, and the release is tried again later
      const outcome = err instanceof Abort && err.outcome === 'rolled_back' ? 'rolled_back' : 'failed';
      // put back what was replaced, newest first, and the tags
      for (const r of [...done].reverse()) {
        await restore(docker, r).catch((e: unknown) => log.error('restore failed', { reason: errorText(e) }));
      }
      for (const [img, id] of moved) await docker.tag(id, repo(img), localTag).catch(() => undefined);
      for (const r of done)
        await waitReady(docker, r.oldId, { timeoutMs: cfg.healthTimeoutMs, sleep: deps.sleep, now: deps.now }).catch(
          () => false,
        );
      await deps.server.hold(0).catch(() => undefined);
      const a = attempt(outcome, {
        reason: done.length && outcome === 'failed' ? `put back after: ${errorText(err)}` : errorText(err),
        ...(backup && { backup }),
        durationMs: deps.now() - startedAt,
      });
      await store.append(a);
      deps.onFailed(a);
      log.error('update failed', { to: target.label, outcome: a.outcome, reason: a.reason });
      return result({ available: target.label, outcome: a.outcome, reason: a.reason });
    }

    for (const r of done) await commit(docker, r);
    const after = await deps.server
      .status()
      .then((s) => s.migrations)
      .catch(() => before);
    const a = attempt('updated', {
      ...(backup && { backup }),
      migrations: { before, after },
      durationMs: deps.now() - startedAt,
      ...(downtimeMs !== undefined && { downtimeMs }),
    });
    await store.append(a);
    log.info('updated', { from: current.version, to: target.label, durationMs: a.durationMs, downtimeMs });
    // keep this release (the updater's image waits for the swap) and the one before: a manual rollback needs no download
    const keep = new Set([...moved.map(([, id]) => id), ...Object.values(ids).map((i) => i.id)]);
    await prune(keep).catch(() => undefined);
    const self = await docker.inspectContainer(cfg.selfId).catch(() => null);
    const updaterNow = (await docker.inspectImage(`${repo('updater')}:${localTag}`))?.Id;
    if (self && updaterNow && self.Image !== updaterNow)
      await launchSwap().catch((e: unknown) => log.error('self-update', { reason: errorText(e) }));
    return result({ available: target.label, outcome: 'updated' });
  }

  return {
    /** One check, and an update when there is one; a second call while one runs is skipped */
    async check(trigger: Trigger, to?: string): Promise<CheckResult | null> {
      if (busy) return null;
      busy = true;
      try {
        return await update(trigger, to);
      } catch (err) {
        const reason = errorText(err);
        log.error('check failed', { reason });
        return { at: iso(), running: 'unknown', available: null, outcome: 'error', reason };
      } finally {
        busy = false;
      }
    },
    get busy() {
      return busy;
    },
  };
}

export type Updater = ReturnType<typeof createUpdater>;
