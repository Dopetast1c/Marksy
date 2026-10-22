import { ProviderPolicyError } from '../providers/errors';
import type { ProviderManifest } from '../providers/manifest';
import type { Logger } from '../providers/types';
import { createAllowListMatcher, createLoginMatcher } from './allow-list';
import { redacting } from './logger';
import type { HttpClient, HttpMethod, HttpRequestOptions, HttpResponse } from './types';

// The shared HTTP client every provider gets as ctx.http (docs/providers.md 7, CLAUDE.md "Hard rules"): strictly
// serial, a random pause from the manifest between requests, exponential backoff on 429 / 5xx / network errors,
// at most three attempts, one login per run that is never retried, and nothing outside the read-only allow-list.
// One client serves one run; a new run gets a new client.

export interface TransportRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

/** A read response as the collector stores it (raw_responses). Never called for the login, whose body is the token. */
export interface ObservedResponse {
  /** The allow-list entry the request matched: the endpoint without ids */
  endpoint: string;
  query: Record<string, string>;
  status: number;
  text: string;
}

export const fetchTransport: Transport = async ({ method, url, headers, body, signal }) => {
  const res = await fetch(url, { method, headers, body, signal, redirect: 'manual' });
  return { status: res.status, headers: Object.fromEntries(res.headers), text: await res.text() };
};

export interface ThrottledClientOptions {
  manifest: Pick<ProviderManifest, 'network' | 'limits' | 'readOnlyAllowList'> & {
    auth: Pick<ProviderManifest['auth'], 'loginRequest'>;
  };
  /** Stricter limits from the environment (docs: .env.example); they can only tighten the manifest's. */
  stricter?: { requestDelayMs?: [number, number]; maxRequestsPerRun?: number };
  transport?: Transport;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  log?: Logger;
  timeoutMs?: number;
  /** Sees the final response of every read request (after retries); the login is never shown to it. */
  onResponse?: (res: ObservedResponse) => void;
}

export const MAX_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 60_000;
/** Headers a provider may not set: method overrides, the host, the length, the user agent (the client owns them). */
const FORBIDDEN_HEADERS = new Set([
  'host',
  'user-agent',
  'content-length',
  'x-http-method-override',
  'x-http-method',
  'x-method-override',
]);
const RETRY_STATUS = (s: number) => s === 429 || s >= 500;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createThrottledClient(opts: ThrottledClientOptions): HttpClient {
  const { manifest } = opts;
  const transport = opts.transport ?? fetchTransport;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const log = opts.log && redacting(opts.log);
  // the manifest schema already says this; checked again here because the client may get an unparsed object
  for (const entry of manifest.readOnlyAllowList) {
    if (!/^(GET|HEAD) /.test(entry) && entry !== manifest.auth.loginRequest) {
      throw new ProviderPolicyError(`${entry} cannot be in a read-only allow-list`);
    }
  }
  // compiled once: changing the manifest object later changes nothing
  const entryOf = createAllowListMatcher([...manifest.readOnlyAllowList]);
  const isLogin = createLoginMatcher(manifest.auth.loginRequest);
  const base = new URL(manifest.network.baseUrl);
  if (base.protocol !== 'https:' || base.username || base.password) {
    throw new ProviderPolicyError('baseUrl must be a plain https origin');
  }

  const [minManifest, maxManifest] = manifest.limits.requestDelayMs;
  const [minEnv, maxEnv] = opts.stricter?.requestDelayMs ?? [0, 0];
  const delayRange: [number, number] = [Math.max(minManifest, minEnv), Math.max(maxManifest, maxEnv, minEnv)];
  const maxRequests = Math.min(manifest.limits.maxRequestsPerRun, opts.stricter?.maxRequestsPerRun ?? Infinity);

  let queue: Promise<unknown> = Promise.resolve();
  let sent = 0;
  let loggedIn = false;

  const pause = () => sleep(delayRange[0] + random() * (delayRange[1] - delayRange[0]));

  function buildUrl(path: string, query: HttpRequestOptions['query']): URL {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new ProviderPolicyError(`Only paths on ${base.origin} are allowed, got ${path.slice(0, 40)}`);
    }
    const url = new URL(path, base);
    if (url.origin !== base.origin) throw new ProviderPolicyError(`Foreign host ${url.host}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    return url;
  }

  async function sendOnce(method: HttpMethod, url: URL, options: HttpRequestOptions): Promise<HttpResponse> {
    if (sent >= maxRequests) throw new ProviderPolicyError(`Request budget of ${maxRequests} per run is used up`);
    if (sent > 0) await pause();
    sent++;
    const headers: Record<string, string> = { accept: 'application/json' };
    if (manifest.network.userAgent) headers['user-agent'] = manifest.network.userAgent;
    for (const [k, v] of Object.entries(options.headers ?? {})) {
      // a header must not turn a GET into something else, or point the request at another host
      if (!FORBIDDEN_HEADERS.has(k.toLowerCase())) headers[k] = v;
    }
    let body: string | undefined;
    if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['content-type'] ??= 'application/json';
    }
    const signal = AbortSignal.timeout(timeoutMs);
    const res = await transport({ method, url: url.toString(), headers, body, signal });
    return {
      ...res,
      json: () => JSON.parse(res.text) as unknown,
    };
  }

  async function run(method: HttpMethod, path: string, options: HttpRequestOptions): Promise<HttpResponse> {
    const url = buildUrl(path, options.query);
    const endpoint = entryOf(method, url.pathname);
    if (endpoint === undefined) {
      throw new ProviderPolicyError(`${method} ${url.pathname} is not in the read-only allow-list`);
    }
    if ((method === 'GET' || method === 'HEAD') && options.body !== undefined) {
      throw new ProviderPolicyError(`${method} cannot carry a body`);
    }
    // the manifest decides what a login is, on any method; the provider's flag can only add to it, never hide one
    const login = options.login === true || isLogin(url.pathname);
    if (login) {
      if (loggedIn) throw new ProviderPolicyError('One login per run');
      loggedIn = true;
    }
    // a failed login is never retried: repeated bad logins can lock the real account
    const attempts = login ? 1 : MAX_ATTEMPTS;
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await sendOnce(method, url, options);
        log?.debug('http', { method, path: url.pathname, status: res.status, attempt });
        const observe = () => {
          if (!login)
            opts.onResponse?.({
              endpoint,
              query: Object.fromEntries(url.searchParams),
              status: res.status,
              text: res.text,
            });
          return res;
        };
        if (!RETRY_STATUS(res.status) || attempt >= attempts) return observe();
        const retryAfter = Number(res.headers['retry-after']);
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt);
        // a server asking for more than the cap gets no retry in this run; the planner tries again later
        if (wait > MAX_RETRY_WAIT_MS) return observe();
        await sleep(wait);
      } catch (err) {
        if (err instanceof ProviderPolicyError || attempt >= attempts) throw err;
        log?.warn('http network error', { endpoint, attempt });
        await sleep(backoff(attempt));
      }
    }
  }

  /** 2x, 4x the longest pause, with jitter */
  const backoff = (attempt: number) => delayRange[1] * 2 ** attempt * (1 + random() * 0.5);

  const request: HttpClient['request'] = (method, path, options = {}) => {
    const next = queue.then(() => run(method, path, options));
    // keep the chain alive after a failure; the caller still gets the rejection
    queue = next.catch(() => undefined);
    return next;
  };

  return {
    request,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    get requestCount() {
      return sent;
    },
  };
}
