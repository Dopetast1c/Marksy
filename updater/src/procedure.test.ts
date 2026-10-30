import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ContainerInspect, Docker, ImageInspect } from './docker';
import { stateStore } from './history';
import type { Attempt } from './history';
import { createUpdater } from './procedure';
import type { ServerApi, UpdaterConfig } from './procedure';
import { parseQuietHours } from './quiet';
import type { Registry } from './registry';

const PREFIX = 'ghcr.io/dopetast1c/marksy-';
const PROJECT = 'marksy-prod';
const SERVICES = ['server', 'backup', 'web', 'proxy', 'updater'] as const;
const IMAGE_OF = { server: 'server', backup: 'server', web: 'web', proxy: 'web', updater: 'updater' } as const;

type Behaviour = 'ok' | 'unhealthy' | 'crash';

/** A Docker daemon in memory: images by id, containers that become healthy, unhealthy or crash by their image */
class FakeDocker implements Docker {
  images = new Map<string, ImageInspect & { behaviour: Behaviour }>();
  containers = new Map<string, ContainerInspect>();
  registryImages = new Map<string, ImageInspect & { behaviour: Behaviour }>();
  log: string[] = [];
  private n = 0;

  addRegistryImage(img: string, version: string, opts: { behaviour?: Behaviour; proxy?: string } = {}) {
    const digest = `sha256:${(img + version)
      .padEnd(64, '0')
      .replace(/[^a-f0-9]/g, 'a')
      .slice(0, 64)}`;
    this.registryImages.set(`${PREFIX}${img}@${digest}`, {
      Id: `sha256:id-${img}-${version}`,
      RepoTags: [],
      RepoDigests: [`${PREFIX}${img}@${digest}`],
      Config: {
        Env: [`MARKSY_VERSION=${version}`, 'PATH=/usr/bin'],
        Cmd: img === 'web' ? ['web'] : ['serve'],
        Labels: {
          'org.opencontainers.image.version': version,
          'org.opencontainers.image.revision': `rev-${version}`,
          ...(opts.proxy && { 'marksy.proxy-config': opts.proxy }),
        },
      },
      behaviour: opts.behaviour ?? 'ok',
    });
    return digest;
  }

  install(version: string) {
    for (const s of SERVICES) {
      const img = IMAGE_OF[s];
      const ref = [...this.registryImages.keys()].find(
        (k) =>
          k.startsWith(`${PREFIX}${img}@`) &&
          this.registryImages.get(k)!.Config.Labels!['org.opencontainers.image.version'] === version,
      )!;
      void this.pull(ref);
      const image = this.images.get(this.registryImages.get(ref)!.Id)!;
      void this.tag(image.Id, `${PREFIX}${img}`, '1');
      const id = `c-${s}-${++this.n}`;
      this.containers.set(id, {
        Id: id,
        Name: `/${PROJECT}-${s}-1`,
        Image: image.Id,
        Config: {
          Env: [...(image.Config.Env ?? []), 'TZ=UTC'],
          Cmd: s === 'proxy' ? ['proxy'] : s === 'backup' ? ['backup-daemon'] : image.Config.Cmd,
          Labels: {
            ...image.Config.Labels,
            'marksy.updatable': 'true',
            'com.docker.compose.project': PROJECT,
            'com.docker.compose.service': s,
            'com.docker.compose.image': image.Id,
          },
        },
        HostConfig: { Binds: [] },
        NetworkSettings: {
          Networks: {
            [`${PROJECT}_edge`]: { Aliases: [s, id.slice(0, 12)] },
            [`${PROJECT}_backend`]: { Aliases: [s] },
          },
        },
        State: { Status: 'running', Running: true, ExitCode: 0, Health: { Status: 'healthy' } },
        RestartCount: 0,
      });
    }
  }

  byName(name: string) {
    return [...this.containers.values()].find((c) => c.Name === `/${name}` || c.Id === name);
  }
  serviceImageVersion(service: string) {
    const c = [...this.containers.values()].find(
      (c) => c.Config.Labels?.['com.docker.compose.service'] === service && !c.Name.endsWith('-previous'),
    )!;
    return this.images.get(c.Image)!.Config.Labels!['org.opencontainers.image.version'];
  }

  async listContainers() {
    return [...this.containers.values()].map((c) => ({
      Id: c.Id,
      Names: [c.Name],
      Image: c.Config.Image ?? c.Image,
      ImageID: c.Image,
      State: c.State.Status,
      Labels: c.Config.Labels ?? {},
    }));
  }
  async inspectContainer(id: string) {
    const c = this.byName(id);
    return c ? structuredClone(c) : null;
  }
  async inspectImage(ref: string) {
    const img =
      this.images.get(ref) ??
      [...this.images.values()].find((i) => i.RepoTags?.includes(ref) || i.RepoDigests?.includes(ref));
    return img ? structuredClone(img) : null;
  }
  async listImages() {
    return [...this.images.values()].map((i) => ({ Id: i.Id, RepoTags: i.RepoTags, RepoDigests: i.RepoDigests }));
  }
  async pull(ref: string) {
    const img = this.registryImages.get(ref);
    if (!img) throw new Error(`pull ${ref}: not found`);
    if (!this.images.has(img.Id)) this.images.set(img.Id, structuredClone(img));
    this.log.push(`pull ${ref.split('@')[0]!.slice(PREFIX.length)}`);
  }
  async tag(image: string, repo: string, tag: string) {
    const ref = `${repo}:${tag}`;
    for (const i of this.images.values()) i.RepoTags = (i.RepoTags ?? []).filter((t) => t !== ref);
    const img = this.images.get(image)!;
    img.RepoTags = [...(img.RepoTags ?? []), ref];
  }
  async removeImage(ref: string) {
    const img = await this.inspectImage(ref);
    if (!img) return;
    if ([...this.containers.values()].some((c) => c.Image === img.Id)) throw new Error('in use');
    this.images.delete(img.Id);
    this.log.push(`rmi ${img.Id}`);
  }
  async create(name: string, spec: Record<string, unknown>) {
    if (this.byName(name)) throw new Error('name in use');
    const image = (await this.inspectImage(spec.Image as string))!;
    const id = `c-${name}-${++this.n}`;
    const endpoints =
      (spec.NetworkingConfig as { EndpointsConfig: Record<string, object> } | undefined)?.EndpointsConfig ?? {};
    this.containers.set(id, {
      Id: id,
      Name: `/${name}`,
      Image: image.Id,
      Config: {
        Image: spec.Image as string,
        Env: [...(image.Config.Env ?? []), ...((spec.Env as string[]) ?? [])],
        Cmd: (spec.Cmd as string[]) ?? image.Config.Cmd,
        Labels: { ...image.Config.Labels, ...(spec.Labels as Record<string, string>) },
      },
      HostConfig: spec.HostConfig as Record<string, unknown>,
      NetworkSettings: { Networks: { ...endpoints } },
      State: { Status: 'created', Running: false, ExitCode: 0 },
      RestartCount: 0,
    });
    this.log.push(`create ${name}`);
    return id;
  }
  async start(id: string) {
    const c = this.byName(id)!;
    const behaviour = this.images.get(c.Image)?.behaviour ?? 'ok';
    c.State =
      behaviour === 'crash'
        ? { Status: 'restarting', Running: false, ExitCode: 1 }
        : {
            Status: 'running',
            Running: true,
            ExitCode: 0,
            Health: { Status: behaviour === 'ok' ? 'healthy' : 'unhealthy' },
          };
    if (behaviour === 'crash') c.RestartCount = 1;
    this.log.push(`start ${c.Name.slice(1)}`);
  }
  async stop(id: string) {
    const c = this.byName(id)!;
    c.State = { Status: 'exited', Running: false, ExitCode: 0 };
    this.log.push(`stop ${c.Name.slice(1)}`);
  }
  async rename(id: string, name: string) {
    this.byName(id)!.Name = `/${name}`;
  }
  async remove(id: string) {
    const c = this.byName(id)!;
    this.containers.delete(c.Id);
    this.log.push(`rm ${c.Name.slice(1)}`);
  }
  async connect(network: string, container: string, endpoint: object) {
    this.byName(container)!.NetworkSettings.Networks[network] = endpoint;
  }
  async memory() {
    return 1;
  }
}

function fakeRegistry(docker: FakeDocker, tags: Record<string, string[]>): Registry {
  return {
    tags: async (img) => tags[img] ?? [],
    digest: async (img, tag) => {
      const ref = [...docker.registryImages.entries()].find(
        ([k, v]) => k.startsWith(`${PREFIX}${img}@`) && v.Config.Labels!['org.opencontainers.image.version'] === tag,
      )?.[0];
      return ref ? ref.split('@')[1]! : null;
    },
  };
}

let docker: FakeDocker;
let failures: Attempt[];
let running: number;
let migrations: number;
let clock: number;
let refusedDigests: Set<string>;

function updater(
  over: Partial<UpdaterConfig> = {},
  tags = {
    server: ['1.0.0', '1.1.0', '1.1.1', '1.2.0', '2.0.0'],
    web: ['1.0.0', '1.1.0', '1.1.1', '1.2.0', '2.0.0'],
    updater: ['1.0.0', '1.1.0', '1.1.1', '1.2.0', '2.0.0'],
  },
  dir?: string,
) {
  const server: ServerApi = {
    hold: async () => undefined,
    status: async () => ({ version: docker.serviceImageVersion('server')!, commit: '', migrations, sync: { running } }),
    health: async () => ({ status: 'ok', version: '', commit: `rev-${docker.serviceImageVersion('server')}` }),
  };
  return createUpdater(
    {
      prefix: PREFIX,
      channel: '1',
      project: PROJECT,
      quiet: null,
      pausedByEnv: false,
      healthTimeoutMs: 60_000,
      collectorWaitMs: 60_000,
      minFreeMb: 1024,
      selfId: [...docker.containers.values()].find((c) => c.Name.includes('updater'))!.Id,
      guardUrl: 'http://socket-guard:2375',
      ...over,
    },
    {
      docker,
      registry: fakeRegistry(docker, tags),
      verify: async (ref) => {
        if (refusedDigests.has(ref.split('@')[1]!)) throw new Error('no matching signatures');
      },
      server,
      backup: async (from, to) => `pre-update/marksy-${from}-to-${to}.dump`,
      store: stateStore(dir!),
      freeMb: async () => 10_000,
      onFailed: (a) => failures.push(a),
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    },
  );
}

let dir: string;
beforeEach(async () => {
  docker = new FakeDocker();
  failures = [];
  running = 0;
  migrations = 13;
  clock = Date.UTC(2026, 9, 30, 12, 0);
  refusedDigests = new Set();
  dir = await mkdtemp(join(tmpdir(), 'marksy-updater-'));
  for (const v of ['1.0.0', '1.1.0', '1.1.1', '1.2.0', '2.0.0'])
    for (const img of ['server', 'web', 'updater'])
      docker.addRegistryImage(img, v, { proxy: img === 'web' ? 'p1' : undefined });
  docker.install('1.0.0');
});

const make = (over: Partial<UpdaterConfig> = {}, tags?: Parameters<typeof updater>[1]) => updater(over, tags, dir);

describe('the update procedure', () => {
  it('channel 1 installs the newest 1.x, never 2.0.0, and the old containers go', async () => {
    const r = await make().check('poll');
    expect(r?.outcome).toBe('updated');
    expect(r?.available).toBe('1.2.0');
    for (const s of ['server', 'backup', 'web']) expect(docker.serviceImageVersion(s)).toBe('1.2.0');
    // the updater itself is replaced by the swap container, which starts last
    expect(docker.log.at(-1)).toBe(`start ${PROJECT}-updater-swap`);
    // the proxy's configuration did not change: it keeps running
    expect(docker.serviceImageVersion('proxy')).toBe('1.0.0');
    expect([...docker.containers.values()].some((c) => c.Name.endsWith('-previous'))).toBe(false);
    // everything was pulled before the first container stopped
    const firstStop = docker.log.findIndex((l) => l.startsWith('stop'));
    expect(docker.log.slice(firstStop).some((l) => l.startsWith('pull'))).toBe(false);
    const [a] = await stateStore(dir).list();
    expect(a).toMatchObject({
      from: '1.0.0',
      to: '1.2.0',
      outcome: 'updated',
      backup: 'pre-update/marksy-1.0.0-to-1.2.0.dump',
    });
    expect(a!.downtimeMs).toBeGreaterThanOrEqual(0);
    expect((await make().check('poll'))?.outcome).toBe('up_to_date');
  });

  it('channel 1.1 takes 1.1.1, not 1.2.0', async () => {
    const r = await make({ channel: '1.1' }).check('poll');
    expect(r?.available).toBe('1.1.1');
    expect(docker.serviceImageVersion('server')).toBe('1.1.1');
  });

  it('the channel tag follows, and the proxy is replaced when its configuration changed', async () => {
    docker.addRegistryImage('server', '1.3.0');
    docker.addRegistryImage('web', '1.3.0', { proxy: 'p2' });
    docker.addRegistryImage('updater', '1.3.0');
    const tags = ['1.0.0', '1.3.0'];
    await make({}, { server: tags, web: tags, updater: tags }).check('poll');
    expect(docker.serviceImageVersion('proxy')).toBe('1.3.0');
    expect((await docker.inspectImage(`${PREFIX}server:1`))?.Config.Labels?.['org.opencontainers.image.version']).toBe(
      '1.3.0',
    );
    // the updater replaces itself last, through a swap container
    expect(docker.log.at(-1)).toBe(`start ${PROJECT}-updater-swap`);
  });

  it('a broken release is rolled back: the old containers run again and the tag points back', async () => {
    docker.addRegistryImage('server', '1.3.0', { behaviour: 'unhealthy' });
    docker.addRegistryImage('web', '1.3.0', { proxy: 'p1' });
    const tags = ['1.0.0', '1.3.0'];
    const r = await make({}, { server: tags, web: tags, updater: ['1.0.0'] }).check('poll');
    expect(r?.outcome).toBe('rolled_back');
    expect(docker.serviceImageVersion('server')).toBe('1.0.0');
    expect(docker.byName(`${PROJECT}-server-1`)?.State.Running).toBe(true);
    expect((await docker.inspectImage(`${PREFIX}server:1`))?.Config.Labels?.['org.opencontainers.image.version']).toBe(
      '1.0.0',
    );
    expect(failures.map((f) => f.outcome)).toEqual(['rolled_back']);
    expect(docker.serviceImageVersion('web')).toBe('1.0.0');
    // not tried again on its own: no second backup, no second rollback
    const u = make({}, { server: tags, web: tags, updater: ['1.0.0'] });
    const before = docker.log.length;
    expect(await u.check('poll')).toMatchObject({ outcome: 'rolled_back', reason: 'rolled back before' });
    expect(docker.log.length).toBe(before);
    expect(failures).toHaveLength(1);
  });

  it('a failing migration (the server exits) is rolled back at once', async () => {
    docker.addRegistryImage('server', '1.3.0', { behaviour: 'crash' });
    docker.addRegistryImage('web', '1.3.0', { proxy: 'p1' });
    const tags = ['1.0.0', '1.3.0'];
    const started = clock;
    const r = await make({}, { server: tags, web: tags, updater: [] }).check('poll');
    expect(r?.outcome).toBe('rolled_back');
    expect(clock - started).toBeLessThan(10_000);
    expect(docker.serviceImageVersion('server')).toBe('1.0.0');
  });

  it('an image without a valid signature is refused before anything is pulled, once', async () => {
    const d = docker.addRegistryImage('web', '1.3.0');
    docker.addRegistryImage('server', '1.3.0');
    refusedDigests.add(d);
    const tags = ['1.0.0', '1.3.0'];
    const u = make({}, { server: tags, web: tags, updater: [] });
    expect((await u.check('poll'))?.outcome).toBe('refused_signature');
    expect((await u.check('poll'))?.outcome).toBe('refused_signature');
    expect(docker.log.filter((l) => l.startsWith('pull 1.3.0') || l.includes('stop'))).toEqual([]);
    expect(failures).toHaveLength(1);
    expect(docker.serviceImageVersion('server')).toBe('1.0.0');
  });

  it('nothing installs inside quiet hours or while the collector reads', async () => {
    const quiet = parseQuietHours(`${String(new Date(clock).getHours()).padStart(2, '0')}:00-23:59`);
    expect((await make({ quiet }).check('poll'))?.outcome).toBe('waiting_quiet_hours');
    expect(docker.serviceImageVersion('server')).toBe('1.0.0');
    running = 1;
    expect((await make().check('hook'))?.outcome).toBe('waiting_collector');
    expect(docker.serviceImageVersion('server')).toBe('1.0.0');
    running = 0;
    expect((await make().check('hook'))?.outcome).toBe('updated');
  });

  it('a pause stops automatic updates, not a manual one; a manual update never goes down', async () => {
    await stateStore(dir).setPaused(true);
    expect((await make().check('poll'))?.outcome).toBe('paused');
    expect((await make().check('manual', '1.1.0'))?.outcome).toBe('updated');
    expect(docker.serviceImageVersion('server')).toBe('1.1.0');
    expect((await make().check('manual', '1.0.0'))?.outcome).toBe('error');
    expect(docker.serviceImageVersion('server')).toBe('1.1.0');
  });

  it('a pinned channel never updates', async () => {
    expect((await make({ channel: '1.0.0' }).check('poll'))?.outcome).toBe('up_to_date');
  });
});
