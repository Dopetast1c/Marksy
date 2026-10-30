// The Docker Engine API the updater uses, through the socket guard (DOCKER_GUARD_URL). Only what an update needs.

export interface ContainerSummary {
  Id: string;
  Names: string[];
  Image: string;
  ImageID: string;
  State: string;
  Labels: Record<string, string>;
}

export interface EndpointSettings {
  Aliases?: string[] | null;
  IPAMConfig?: Record<string, unknown> | null;
  NetworkID?: string;
}

export interface ContainerConfig {
  Image?: string;
  Env?: string[] | null;
  Cmd?: string[] | null;
  Entrypoint?: string[] | null;
  Labels?: Record<string, string> | null;
  Healthcheck?: Record<string, unknown> | null;
  User?: string;
  WorkingDir?: string;
  ExposedPorts?: Record<string, unknown> | null;
  StopSignal?: string;
  StopTimeout?: number;
  Tty?: boolean;
  OpenStdin?: boolean;
}

export interface ContainerInspect {
  Id: string;
  Name: string;
  Image: string;
  Config: ContainerConfig;
  HostConfig: Record<string, unknown>;
  NetworkSettings: { Networks: Record<string, EndpointSettings> };
  State: {
    Status: string;
    Running: boolean;
    ExitCode: number;
    StartedAt?: string;
    Health?: { Status: 'starting' | 'healthy' | 'unhealthy' | 'none' };
  };
  RestartCount: number;
}

export interface ImageInspect {
  Id: string;
  RepoTags: string[] | null;
  RepoDigests: string[] | null;
  Config: ContainerConfig;
}

export interface ImageSummary {
  Id: string;
  RepoTags: string[] | null;
  RepoDigests: string[] | null;
  Containers?: number;
}

export interface Docker {
  listContainers(project: string): Promise<ContainerSummary[]>;
  inspectContainer(id: string): Promise<ContainerInspect | null>;
  inspectImage(ref: string): Promise<ImageInspect | null>;
  listImages(): Promise<ImageSummary[]>;
  pull(ref: string): Promise<void>;
  tag(image: string, repo: string, tag: string): Promise<void>;
  removeImage(ref: string): Promise<void>;
  create(name: string, spec: Record<string, unknown>): Promise<string>;
  start(id: string): Promise<void>;
  stop(id: string, seconds: number): Promise<void>;
  rename(id: string, name: string): Promise<void>;
  remove(id: string): Promise<void>;
  connect(network: string, container: string, endpoint: EndpointSettings): Promise<void>;
  memory(id: string): Promise<number | null>;
}

export class DockerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function dockerClient(baseUrl: string): Docker {
  const call = async (method: string, path: string, body?: unknown, timeoutMs = 60_000) => {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok && res.status !== 304) {
      const text = await res.text().catch(() => '');
      let message = text;
      try {
        message = (JSON.parse(text) as { message?: string }).message ?? text;
      } catch {
        // plain text
      }
      throw new DockerError(res.status, `${method} ${path.split('?')[0]}: ${res.status} ${message}`.slice(0, 300));
    }
    return res;
  };
  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
    (await (await call(method, path, body)).json()) as T;
  const orNull = async <T>(work: () => Promise<T>): Promise<T | null> => {
    try {
      return await work();
    } catch (err) {
      if (err instanceof DockerError && err.status === 404) return null;
      throw err;
    }
  };
  const id = encodeURIComponent;

  return {
    listContainers: (project) =>
      json(
        'GET',
        `/containers/json?all=1&filters=${id(JSON.stringify({ label: [`com.docker.compose.project=${project}`] }))}`,
      ),
    inspectContainer: (c) => orNull(() => json(`GET`, `/containers/${id(c)}/json`)),
    inspectImage: (ref) => orNull(() => json('GET', `/images/${ref.split('/').map(id).join('/')}/json`)),
    listImages: () => json('GET', '/images/json'),
    async pull(ref) {
      const at = ref.lastIndexOf('@');
      const colon = ref.lastIndexOf(':');
      const [from, tag] =
        at > 0
          ? [ref.slice(0, at), ref.slice(at + 1)]
          : colon > ref.lastIndexOf('/')
            ? [ref.slice(0, colon), ref.slice(colon + 1)]
            : [ref, 'latest'];
      const res = await call('POST', `/images/create?fromImage=${id(from)}&tag=${id(tag)}`, undefined, 15 * 60_000);
      // the answer is a stream of progress lines; an error arrives as one of them with status 200
      const text = await res.text();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as { error?: string; errorDetail?: { message?: string } };
          if (event.error) throw new Error(`pull ${ref}: ${event.errorDetail?.message ?? event.error}`);
        } catch (err) {
          if (err instanceof SyntaxError) continue;
          throw err;
        }
      }
    },
    async tag(image, repo, tag) {
      await call('POST', `/images/${image.split('/').map(id).join('/')}/tag?repo=${id(repo)}&tag=${id(tag)}`);
    },
    async removeImage(ref) {
      await call('DELETE', `/images/${ref.split('/').map(id).join('/')}`);
    },
    async create(name, spec) {
      return (await json<{ Id: string }>('POST', `/containers/create?name=${id(name)}`, spec)).Id;
    },
    async start(c) {
      await call('POST', `/containers/${id(c)}/start`);
    },
    async stop(c, seconds) {
      await call('POST', `/containers/${id(c)}/stop?t=${seconds}`, undefined, (seconds + 30) * 1000);
    },
    async rename(c, name) {
      await call('POST', `/containers/${id(c)}/rename?name=${id(name)}`);
    },
    async remove(c) {
      await call('DELETE', `/containers/${id(c)}?force=true`);
    },
    async connect(network, container, endpoint) {
      await call('POST', `/networks/${id(network)}/connect`, { Container: container, EndpointConfig: endpoint });
    },
    async memory(c) {
      const s = await orNull(() =>
        json<{ memory_stats?: { usage?: number; stats?: { inactive_file?: number } } }>(
          'GET',
          `/containers/${id(c)}/stats?stream=false`,
        ),
      );
      const usage = s?.memory_stats?.usage;
      return usage === undefined ? null : usage - (s?.memory_stats?.stats?.inactive_file ?? 0);
    },
  };
}
