// The socket guard's rules (docs/running.md, updates). The guard is the only container that mounts the Docker socket;
// the updater talks to it, and it lets through only what an update needs, on Marksy's own containers and images:
//   ping, version, disk usage;
//   list, inspect, stats, start, stop, rename, remove, wait of containers labelled marksy.updatable=true;
//   create of such a container from a Marksy image, with nothing that reaches the host (no privileged mode, no added
//   capabilities, devices, host namespaces or Docker socket);
//   connect of such a container to a network of its own compose project;
//   pull, inspect, tag, remove and list of Marksy images.
// Everything else is refused with 403.

export const UPDATABLE = 'marksy.updatable';
const PROJECT = 'com.docker.compose.project';

export interface GuardRequest {
  method: string;
  /** without the /v1.xx prefix */
  path: string;
  query: URLSearchParams;
  body?: unknown;
}

export interface GuardLookup {
  containerLabels(id: string): Promise<Record<string, string> | null>;
  imageNames(id: string): Promise<string[] | null>;
  networkLabels(id: string): Promise<Record<string, string> | null>;
}

export type GuardDecision =
  { allow: true; query?: URLSearchParams; filterImages?: boolean } | { allow: false; reason: string };

const deny = (reason: string): GuardDecision => ({ allow: false, reason });
const ALLOW: GuardDecision = { allow: true };

/** The API path without its version prefix */
export function unversioned(path: string): string {
  return path.replace(/^\/v\d+\.\d+(?=\/)/, '');
}

/** Whether an image reference (name:tag, name@digest) is one of Marksy's images */
export function isMarksyImage(ref: string, prefix: string): boolean {
  if (!ref.startsWith(prefix)) return false;
  const rest = ref.slice(prefix.length);
  return /^[a-z0-9-]+([:@][\w.:-]+)?$/.test(rest);
}

async function updatable(id: string, lookup: GuardLookup): Promise<Record<string, string> | null> {
  const labels = await lookup.containerLabels(decodeURIComponent(id));
  return labels && labels[UPDATABLE] === 'true' ? labels : null;
}

async function marksyImage(name: string, lookup: GuardLookup, prefix: string): Promise<boolean> {
  const ref = decodeURIComponent(name);
  if (isMarksyImage(ref, prefix)) return true;
  if (!/^(sha256:)?[a-f0-9]{12,64}$/.test(ref)) return false;
  const names = await lookup.imageNames(ref);
  return !!names && names.length > 0 && names.every((n) => isMarksyImage(n, prefix));
}

type Spec = Record<string, unknown>;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const SOCKET = /docker\.sock|\/var\/run\/docker|\/run\/docker/;

/** What a container create must not ask for */
export function createProblems(body: unknown, prefix: string): string[] {
  const spec = (body ?? {}) as Spec;
  const host = (spec.HostConfig ?? {}) as Spec;
  const labels = (spec.Labels ?? {}) as Record<string, string>;
  const problems: string[] = [];
  if (typeof spec.Image !== 'string' || !isMarksyImage(spec.Image, prefix)) problems.push('image');
  if (labels[UPDATABLE] !== 'true') problems.push('label');
  if (host.Privileged) problems.push('privileged');
  if (list(host.CapAdd).length) problems.push('capabilities');
  if (list(host.Devices).length || list(host.DeviceRequests).length || list(host.DeviceCgroupRules).length)
    problems.push('devices');
  for (const mode of ['NetworkMode', 'PidMode', 'IpcMode', 'UTSMode', 'UsernsMode', 'CgroupnsMode'])
    if (host[mode] === 'host') problems.push(mode);
  if (list(host.SecurityOpt).some((o) => String(o).includes('unconfined'))) problems.push('security');
  if (list(host.VolumesFrom).length) problems.push('volumes_from');
  if (list(host.Binds).some((b) => SOCKET.test(String(b)))) problems.push('socket');
  if (list(host.Mounts).some((m) => SOCKET.test(String((m as Spec).Source ?? '')))) problems.push('socket');
  if (spec.Volumes && Object.keys(spec.Volumes as Spec).some((v) => SOCKET.test(v))) problems.push('socket');
  return problems;
}

export async function decide(req: GuardRequest, lookup: GuardLookup, prefix: string): Promise<GuardDecision> {
  const { method, query } = req;
  const path = unversioned(req.path);
  const parts = path.split('/').filter(Boolean);

  if ((method === 'GET' || method === 'HEAD') && (path === '/_ping' || path === '/version')) return ALLOW;
  if (method === 'GET' && path === '/system/df') return ALLOW;

  if (parts[0] === 'containers') {
    if (method === 'GET' && path === '/containers/json') {
      // only Marksy's containers, whatever the caller asked for
      let filters: Record<string, string[]>;
      try {
        filters = JSON.parse(query.get('filters') ?? '{}') as Record<string, string[]>;
      } catch {
        return deny('filters');
      }
      filters.label = [...(filters.label ?? []), `${UPDATABLE}=true`];
      const next = new URLSearchParams(query);
      next.set('filters', JSON.stringify(filters));
      return { allow: true, query: next };
    }
    if (method === 'POST' && path === '/containers/create') {
      const problems = createProblems(req.body, prefix);
      return problems.length ? deny(`create: ${problems.join(', ')}`) : ALLOW;
    }
    const [, id, action] = parts;
    if (!id || parts.length > 3) return deny('path');
    const allowed =
      (method === 'GET' && (action === 'json' || action === 'stats')) ||
      (method === 'POST' && ['start', 'stop', 'restart', 'rename', 'wait'].includes(action ?? '')) ||
      (method === 'DELETE' && action === undefined);
    if (!allowed) return deny('container action');
    if (action === 'stats' && query.get('stream') !== 'false') return deny('stats stream');
    if (await updatable(id, lookup)) return ALLOW;
    // asking whether a container exists is fine: Docker answers 404 when it does not; it says nothing about others
    if (method === 'GET' && action === 'json' && (await lookup.containerLabels(decodeURIComponent(id))) === null)
      return ALLOW;
    return deny('not a Marksy container');
  }

  if (parts[0] === 'images') {
    if (method === 'GET' && path === '/images/json') return { allow: true, filterImages: true };
    if (method === 'POST' && path === '/images/create') {
      if (query.has('fromSrc') || query.has('repo')) return deny('import');
      const from = query.get('fromImage') ?? '';
      const tag = query.get('tag');
      const ref = tag ? `${from}${tag.startsWith('sha256:') ? '@' : ':'}${tag}` : from;
      return isMarksyImage(ref, prefix) ? ALLOW : deny('not a Marksy image');
    }
    // /images/<name, which may hold slashes>/json|tag, DELETE /images/<name>
    const name = path.slice('/images/'.length);
    if (method === 'GET' && name.endsWith('/json'))
      return (await marksyImage(name.slice(0, -5), lookup, prefix)) ? ALLOW : deny('not a Marksy image');
    if (method === 'POST' && name.endsWith('/tag')) {
      const target = `${query.get('repo') ?? ''}:${query.get('tag') ?? 'latest'}`;
      if (!isMarksyImage(target, prefix)) return deny('tag outside Marksy');
      return (await marksyImage(name.slice(0, -4), lookup, prefix)) ? ALLOW : deny('not a Marksy image');
    }
    if (method === 'DELETE' && name && !name.includes('/json'))
      return (await marksyImage(name, lookup, prefix)) ? ALLOW : deny('not a Marksy image');
    return deny('image action');
  }

  if (method === 'POST' && parts[0] === 'networks' && parts[2] === 'connect' && parts.length === 3) {
    const container = String(((req.body ?? {}) as Spec).Container ?? '');
    const labels = container ? await updatable(container, lookup) : null;
    if (!labels) return deny('not a Marksy container');
    const network = await lookup.networkLabels(decodeURIComponent(parts[1]!));
    return network && network[PROJECT] && network[PROJECT] === labels[PROJECT] ? ALLOW : deny('foreign network');
  }

  return deny('not allowed');
}

/** The image list, cut down to Marksy's images */
export function filterImageList(list: unknown, prefix: string): unknown {
  if (!Array.isArray(list)) return [];
  return list.filter((img: { RepoTags?: string[] | null; RepoDigests?: string[] | null }) =>
    [...(img.RepoTags ?? []), ...(img.RepoDigests ?? [])].some((n) => isMarksyImage(n, prefix)),
  );
}
