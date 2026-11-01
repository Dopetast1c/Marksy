import { describe, expect, it } from 'vitest';
import { createProblems, decide, filterImageList, isMarksyImage, unversioned } from './guard-rules';
import type { ExistingContainer, GuardLookup } from './guard-rules';

const PREFIX = 'ghcr.io/dopetast1c/marksy-';
const project = { 'com.docker.compose.project': 'marksy-prod' };
const backupLabels = {
  'marksy.updatable': 'true',
  ...project,
  'com.docker.compose.service': 'backup',
  'com.docker.compose.image': 'sha256:old',
};
const backupHost = {
  Binds: ['/srv/backups:/backups'],
  Mounts: [{ Type: 'volume', Source: 'marksy-prod-uploads' }],
  NetworkMode: 'marksy-prod_backend',
};
/** the backup container compose made: what a create for that service must copy */
const backup1: ExistingContainer = {
  Config: {
    Labels: backupLabels,
    Env: ['PATH=/usr/bin', 'TZ=Europe/Vienna', 'BACKUP_DIR=/backups'],
    Cmd: ['backup-daemon'],
    User: 'node',
  },
  HostConfig: backupHost,
  NetworkSettings: { Networks: { 'marksy-prod_backend': {} } },
};

const lookup: GuardLookup = {
  containerLabels: async (id) =>
    id === 'server1'
      ? { 'marksy.updatable': 'true', ...project }
      : id === 'updater1'
        ? { 'marksy.updatable': 'true', ...project, 'com.docker.compose.service': 'updater' }
        : id === 'postgres1'
          ? { ...project }
          : null,
  serviceContainers: async (p, s) => (p === 'marksy-prod' && s === 'backup' ? [backup1] : []),
  imageNames: async (id) =>
    id === 'sha256:aaaaaaaaaaaa'
      ? [`${PREFIX}server:1`, `${PREFIX}server@sha256:${'1'.repeat(64)}`]
      : id === 'sha256:bbbbbbbbbbbb'
        ? ['postgres:16']
        : null,
  networkLabels: async (id) =>
    id === 'marksy-prod_edge' || id === 'marksy-prod_docker'
      ? project
      : id === 'other_net'
        ? { 'com.docker.compose.project': 'other' }
        : null,
};

const ask = (method: string, path: string, query = '', body?: unknown) =>
  decide({ method, path, query: new URLSearchParams(query), body }, lookup, PREFIX);

// what recreate.ts sends for the backup service: the container's own settings on a new image
const goodCreate = {
  Image: `${PREFIX}server:1`,
  Env: ['TZ=Europe/Vienna', 'BACKUP_DIR=/backups'],
  Labels: { ...backupLabels, 'com.docker.compose.image': 'sha256:new' },
  HostConfig: backupHost,
  Cmd: ['backup-daemon'],
  NetworkingConfig: { EndpointsConfig: { 'marksy-prod_backend': { Aliases: ['backup'] } } },
};
const swapCreate = {
  Image: `${PREFIX}updater:1`,
  Cmd: ['swap', 'updater1'],
  Env: ['DOCKER_GUARD_URL=http://socket-guard:2375', `UPDATE_IMAGE_PREFIX=${PREFIX}`, 'UPDATE_CHANNEL=1'],
  Labels: { 'marksy.updatable': 'true', ...project },
  HostConfig: { AutoRemove: true, NetworkMode: 'marksy-prod_docker' },
};

describe('the socket guard', () => {
  it('lets through ping, version and disk usage, under any API version', async () => {
    expect(unversioned('/v1.45/containers/json')).toBe('/containers/json');
    expect((await ask('GET', '/v1.45/_ping')).allow).toBe(true);
    expect((await ask('GET', '/version')).allow).toBe(true);
    expect((await ask('GET', '/system/df')).allow).toBe(true);
    expect((await ask('GET', '/info')).allow).toBe(false);
  });

  it('lists only Marksy containers', async () => {
    const d = await ask('GET', '/containers/json', 'all=1&filters={"label":["com.docker.compose.project=x"]}');
    expect(d.allow).toBe(true);
    if (d.allow) expect(JSON.parse(d.query!.get('filters')!).label).toContain('marksy.updatable=true');
  });

  it('acts only on labelled containers, never exec, attach or archive', async () => {
    expect((await ask('POST', '/containers/server1/stop')).allow).toBe(true);
    expect((await ask('DELETE', '/containers/server1')).allow).toBe(true);
    expect((await ask('GET', '/containers/server1/stats', 'stream=false')).allow).toBe(true);
    expect((await ask('POST', '/containers/postgres1/stop')).allow).toBe(false);
    expect((await ask('DELETE', '/containers/postgres1')).allow).toBe(false);
    expect((await ask('POST', '/containers/server1/exec')).allow).toBe(false);
    expect((await ask('POST', '/containers/server1/attach')).allow).toBe(false);
    expect((await ask('GET', '/containers/server1/archive')).allow).toBe(false);
    expect((await ask('GET', '/containers/server1/stats')).allow).toBe(false);
    // whether a container exists: Docker answers 404; a foreign one stays hidden
    expect((await ask('GET', '/containers/gone/json')).allow).toBe(true);
    expect((await ask('GET', '/containers/postgres1/json')).allow).toBe(false);
    expect((await ask('DELETE', '/containers/gone')).allow).toBe(false);
  });

  it('creates only a labelled container from a Marksy image with nothing that reaches the host', async () => {
    expect((await ask('POST', '/containers/create', 'name=x', goodCreate)).allow).toBe(true);
    expect(createProblems({ ...goodCreate, Image: 'alpine' }, PREFIX)).toEqual(['image']);
    expect(createProblems({ ...goodCreate, Image: `${PREFIX}server:1/../../x` }, PREFIX)).toEqual(['image']);
    expect(createProblems({ ...goodCreate, Labels: {} }, PREFIX)).toEqual(['label']);
    const host = (h: object) => createProblems({ ...goodCreate, HostConfig: h }, PREFIX);
    expect(host({ Privileged: true })).toEqual(['privileged']);
    expect(host({ CapAdd: ['SYS_ADMIN'] })).toEqual(['capabilities']);
    expect(host({ Devices: [{ PathOnHost: '/dev/mem' }] })).toEqual(['devices']);
    expect(host({ PidMode: 'host', NetworkMode: 'host' })).toEqual(['NetworkMode', 'PidMode']);
    expect(host({ Binds: ['/var/run/docker.sock:/var/run/docker.sock'] })).toEqual(['socket']);
    expect(host({ Mounts: [{ Type: 'bind', Source: '/run/docker.sock' }] })).toEqual(['socket']);
    expect(host({ SecurityOpt: ['seccomp=unconfined'] })).toEqual(['security']);
    expect(host({ VolumesFrom: ['postgres1'] })).toEqual(['volumes_from']);
  });

  it("creates only a copy of the service's own container: no other host path, user, command or environment", async () => {
    const create = async (change: object) =>
      ask('POST', '/containers/create', 'name=x', { ...goodCreate, ...change }) as Promise<{ reason?: string }>;
    // a whole host folder, or the folder that holds the Docker socket, under a service that never had it
    expect((await create({ HostConfig: { ...backupHost, Binds: ['/:/host'] } })).reason).toContain('host settings');
    expect((await create({ HostConfig: { ...backupHost, Binds: ['/var/run:/r'] } })).reason).toContain('host settings');
    expect((await create({ User: 'root' })).reason).toContain('User');
    expect((await create({ Cmd: ['sh', '-c', 'x'] })).reason).toContain('Cmd');
    expect((await create({ Entrypoint: ['sh'] })).reason).toContain('Entrypoint');
    expect((await create({ Env: ['NODE_OPTIONS=--require /tmp/x'] })).reason).toContain('environment');
    expect((await create({ Volumes: { '/x': {} } })).reason).toContain('fields');
    expect((await create({ NetworkingConfig: { EndpointsConfig: { other_net: {} } } })).reason).toContain('network');
    expect((await create({ Labels: { ...goodCreate.Labels, 'com.docker.compose.service': 'web' } })).reason).toContain(
      'no container of this service',
    );
    expect((await create({ Labels: { 'marksy.updatable': 'true' } })).reason).toContain('project');
  });

  it("creates the updater's swap container only in its one shape", async () => {
    const swap = async (change: object) =>
      ask('POST', '/containers/create', 'name=marksy-prod-updater-swap', { ...swapCreate, ...change });
    expect((await swap({})).allow).toBe(true);
    expect((await swap({ Cmd: ['swap', 'server1'] })).allow).toBe(false);
    expect((await swap({ Cmd: ['sh'] })).allow).toBe(false);
    expect((await swap({ Image: `${PREFIX}server:1` })).allow).toBe(false);
    expect((await swap({ HostConfig: { AutoRemove: true, Binds: ['/:/host'] } })).allow).toBe(false);
    expect((await swap({ HostConfig: { NetworkMode: 'other_net' } })).allow).toBe(false);
    expect((await swap({ Env: ['NODE_OPTIONS=x'] })).allow).toBe(false);
    expect((await swap({ User: 'root' })).allow).toBe(false);
  });

  it('pulls, tags, inspects and removes only Marksy images', async () => {
    expect((await ask('POST', '/images/create', `fromImage=${PREFIX}server&tag=1.2.0`)).allow).toBe(true);
    expect((await ask('POST', '/images/create', `fromImage=${PREFIX}web&tag=sha256:${'2'.repeat(64)}`)).allow).toBe(
      true,
    );
    expect((await ask('POST', '/images/create', 'fromImage=alpine&tag=latest')).allow).toBe(false);
    expect((await ask('POST', '/images/create', 'fromSrc=-&repo=x')).allow).toBe(false);
    expect((await ask('GET', `/images/${PREFIX}server:1/json`)).allow).toBe(true);
    expect((await ask('GET', '/images/sha256:aaaaaaaaaaaa/json')).allow).toBe(true);
    expect((await ask('GET', '/images/sha256:bbbbbbbbbbbb/json')).allow).toBe(false);
    expect((await ask('POST', '/images/sha256:aaaaaaaaaaaa/tag', `repo=${PREFIX}server&tag=1`)).allow).toBe(true);
    expect((await ask('POST', '/images/sha256:aaaaaaaaaaaa/tag', 'repo=evil/server&tag=1')).allow).toBe(false);
    expect((await ask('POST', '/images/sha256:bbbbbbbbbbbb/tag', `repo=${PREFIX}server&tag=1`)).allow).toBe(false);
    expect((await ask('DELETE', `/images/${PREFIX}server:1.0.0`)).allow).toBe(true);
    expect((await ask('DELETE', '/images/postgres:16')).allow).toBe(false);
    expect((await ask('POST', '/images/load')).allow).toBe(false);
    expect((await ask('POST', '/build')).allow).toBe(false);
  });

  it('connects a Marksy container only to a network of its own project', async () => {
    expect((await ask('POST', '/networks/marksy-prod_edge/connect', '', { Container: 'server1' })).allow).toBe(true);
    expect((await ask('POST', '/networks/other_net/connect', '', { Container: 'server1' })).allow).toBe(false);
    expect((await ask('POST', '/networks/marksy-prod_edge/connect', '', { Container: 'postgres1' })).allow).toBe(false);
    expect((await ask('POST', '/networks/create', '', { Name: 'x' })).allow).toBe(false);
  });

  it('refuses everything else', async () => {
    for (const [m, p] of [
      ['POST', '/swarm/init'],
      ['GET', '/secrets'],
      ['POST', '/volumes/create'],
      ['DELETE', '/volumes/marksy-prod-pgdata'],
      ['POST', '/plugins/pull'],
      ['GET', '/events'],
    ] as const)
      expect((await ask(m, p)).allow).toBe(false);
  });

  it('cuts the image list down to Marksy images', () => {
    expect(
      filterImageList(
        [
          { Id: 'a', RepoTags: [`${PREFIX}server:1`] },
          { Id: 'b', RepoTags: ['postgres:16'] },
          { Id: 'c', RepoTags: null, RepoDigests: [`${PREFIX}web@sha256:${'3'.repeat(64)}`] },
        ],
        PREFIX,
      ),
    ).toEqual([
      { Id: 'a', RepoTags: [`${PREFIX}server:1`] },
      { Id: 'c', RepoTags: null, RepoDigests: [`${PREFIX}web@sha256:${'3'.repeat(64)}`] },
    ]);
    expect(isMarksyImage(`${PREFIX}server`, PREFIX)).toBe(true);
    expect(isMarksyImage('ghcr.io/dopetast1c/other:1', PREFIX)).toBe(false);
  });
});
