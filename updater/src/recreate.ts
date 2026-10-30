import type { ContainerInspect, Docker, EndpointSettings, ImageInspect } from './docker';

// Replacing one container with the same container on a new image, the way `docker compose up` would: the same name,
// settings, volumes, networks and aliases; what came from the old image (its environment, labels, command and health
// check) is left for the new image to bring. The old container is kept, stopped and renamed, until the whole update
// has succeeded, so that a rollback only has to start it again.

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export interface Spec {
  name: string;
  body: Record<string, unknown>;
  /** networks after the first, connected once the container exists */
  more: [string, EndpointSettings][];
}

export function containerSpec(old: ContainerInspect, oldImage: ImageInspect, image: string, imageId: string): Spec {
  const c = old.Config;
  const i = oldImage.Config ?? {};
  const imageEnv = new Set(i.Env ?? []);
  const imageLabels = i.Labels ?? {};
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(c.Labels ?? {})) if (imageLabels[k] !== v) labels[k] = v;
  // compose compares this label with the image of the service: it must name the new image, or the next `up` recreates
  if ('com.docker.compose.image' in labels) labels['com.docker.compose.image'] = imageId;
  const shortId = old.Id.slice(0, 12);
  const endpoint = (e: EndpointSettings): EndpointSettings => ({
    Aliases: (e.Aliases ?? []).filter((a) => a !== shortId && a !== old.Id),
    ...(e.IPAMConfig && Object.keys(e.IPAMConfig).length > 0 && { IPAMConfig: e.IPAMConfig }),
  });
  const networks = Object.entries(old.NetworkSettings.Networks ?? {});
  const [first, ...rest] = networks;
  const body: Record<string, unknown> = {
    Image: image,
    Env: (c.Env ?? []).filter((e) => !imageEnv.has(e)),
    Labels: labels,
    HostConfig: old.HostConfig,
    ...(!same(c.Cmd, i.Cmd) && { Cmd: c.Cmd }),
    ...(!same(c.Entrypoint, i.Entrypoint) && { Entrypoint: c.Entrypoint }),
    ...(!same(c.Healthcheck, i.Healthcheck) && { Healthcheck: c.Healthcheck }),
    ...(c.User !== i.User && { User: c.User }),
    ...(c.WorkingDir !== i.WorkingDir && { WorkingDir: c.WorkingDir }),
    ...(c.StopSignal && c.StopSignal !== i.StopSignal && { StopSignal: c.StopSignal }),
    ...(c.StopTimeout !== undefined && { StopTimeout: c.StopTimeout }),
    ...(c.Tty && { Tty: true }),
    ...(c.OpenStdin && { OpenStdin: true }),
    ...(first && { NetworkingConfig: { EndpointsConfig: { [first[0]]: endpoint(first[1]) } } }),
  };
  return {
    name: old.Name.replace(/^\//, ''),
    body,
    more: rest.map(([n, e]) => [n, endpoint(e)]),
  };
}

export interface Replaced {
  name: string;
  oldId: string;
  newId: string;
  /** the old container's name while it waits */
  parked: string;
}

export interface ReadyOptions {
  timeoutMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** an extra check once Docker reports the container healthy (the server's version) */
  check?: () => Promise<boolean>;
}

/** Waits until a container is healthy (or running, when it has no health check); false when it fails or times out */
export async function waitReady(docker: Docker, id: string, opts: ReadyOptions): Promise<boolean> {
  const until = opts.now() + opts.timeoutMs;
  while (opts.now() < until) {
    const c = await docker.inspectContainer(id);
    if (!c) return false;
    // a container that exits (a failed migration ends the server) is restarted by Docker: one restart is a failure
    if (c.RestartCount > 0 || (!c.State.Running && c.State.Status !== 'created')) return false;
    const health = c.State.Health?.Status;
    if (health === 'unhealthy') return false;
    if ((health === 'healthy' || !health || health === 'none') && c.State.Running) {
      if (!opts.check || (await opts.check())) return true;
    }
    await opts.sleep(2000);
  }
  return false;
}

export async function replace(
  docker: Docker,
  containerId: string,
  image: string,
  imageId: string,
  ready: ReadyOptions,
): Promise<{ replaced: Replaced; ok: boolean }> {
  const old = await docker.inspectContainer(containerId);
  if (!old) throw new Error('container gone');
  const oldImage = await docker.inspectImage(old.Image);
  if (!oldImage) throw new Error('old image gone');
  const spec = containerSpec(old, oldImage, image, imageId);
  const parked = `${spec.name}-previous`;
  // a parked container left by an interrupted update is in the way
  const stale = await docker.inspectContainer(parked);
  if (stale) await docker.remove(stale.Id);
  await docker.stop(old.Id, 30);
  await docker.rename(old.Id, parked);
  let newId = '';
  try {
    newId = await docker.create(spec.name, spec.body);
    for (const [network, endpoint] of spec.more) await docker.connect(network, newId, endpoint);
    await docker.start(newId);
  } catch (err) {
    if (newId) await docker.remove(newId).catch(() => undefined);
    await docker.rename(old.Id, spec.name);
    await docker.start(old.Id);
    throw err;
  }
  const replaced = { name: spec.name, oldId: old.Id, newId, parked };
  return { replaced, ok: await waitReady(docker, newId, ready) };
}

/** Puts the old container back: the new one is removed, the old one gets its name and starts */
export async function restore(docker: Docker, r: Replaced): Promise<void> {
  await docker.remove(r.newId).catch(() => undefined);
  await docker.rename(r.oldId, r.name);
  await docker.start(r.oldId);
}

/** The update succeeded: the parked old container goes */
export async function commit(docker: Docker, r: Replaced): Promise<void> {
  await docker.remove(r.oldId).catch(() => undefined);
}
