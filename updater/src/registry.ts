// The registry, read anonymously (the images are public): the tags of an image and the digest a tag points to. A check
// downloads nothing but these small JSON answers; images are pulled only when an update is going to happen.

const MANIFESTS = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

export interface Registry {
  tags(image: string): Promise<string[]>;
  digest(image: string, tag: string): Promise<string | null>;
}

/** Splits "ghcr.io/owner/marksy-" into the registry's address and the repository prefix */
export function registryOf(prefix: string): { base: string; repo: string } {
  const slash = prefix.indexOf('/');
  const host = prefix.slice(0, slash);
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return { base: `${local ? 'http' : 'https'}://${host}`, repo: prefix.slice(slash + 1) };
}

function challenge(header: string | null): Record<string, string> | null {
  if (!header?.startsWith('Bearer ')) return null;
  const out: Record<string, string> = {};
  for (const m of header.slice(7).matchAll(/(\w+)="([^"]*)"/g)) out[m[1]!] = m[2]!;
  return out.realm ? out : null;
}

export function registryClient(prefix: string, fetchImpl: typeof fetch = fetch): Registry {
  const { base, repo } = registryOf(prefix);
  const tokens = new Map<string, string>();

  const get = async (path: string, image: string, init: RequestInit = {}): Promise<Response> => {
    const scope = `repository:${repo}${image}:pull`;
    const send = () =>
      fetchImpl(`${base}${path}`, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          ...(tokens.has(scope) && { authorization: `Bearer ${tokens.get(scope)}` }),
        },
        signal: AbortSignal.timeout(20_000),
      });
    let res = await send();
    const c = res.status === 401 ? challenge(res.headers.get('www-authenticate')) : null;
    if (c) {
      const url = new URL(c.realm!);
      if (c.service) url.searchParams.set('service', c.service);
      url.searchParams.set('scope', scope);
      const t = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
      if (!t.ok) throw new Error(`registry token: ${t.status}`);
      const body = (await t.json()) as { token?: string; access_token?: string };
      tokens.set(scope, body.token ?? body.access_token ?? '');
      res = await send();
    }
    return res;
  };

  return {
    async tags(image) {
      const all: string[] = [];
      let path: string | null = `/v2/${repo}${image}/tags/list?n=1000`;
      for (let page = 0; path && page < 20; page++) {
        const res = await get(path, image);
        if (res.status === 404) return all;
        if (!res.ok) throw new Error(`registry tags: ${res.status}`);
        all.push(...(((await res.json()) as { tags?: string[] | null }).tags ?? []));
        const next = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
        path = next ? (next.startsWith('http') ? new URL(next).pathname + new URL(next).search : next) : null;
      }
      return all;
    },
    async digest(image, tag) {
      const res = await get(`/v2/${repo}${image}/manifests/${tag}`, image, {
        method: 'HEAD',
        headers: { accept: MANIFESTS },
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`registry manifest: ${res.status}`);
      return res.headers.get('docker-content-digest');
    },
  };
}
