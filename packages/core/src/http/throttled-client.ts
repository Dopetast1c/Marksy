import { ProviderPolicyError } from '../providers/errors';
import type { ProviderManifest } from '../providers/manifest';
import type { Logger } from '../providers/types';
import { createAllowList } from './allow-list';
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
}

export const MAX_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 60_000;
const RETRY_STATUS = (s: number) => s === 429 || s >= 500;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createThrottledClient(opts: ThrottledClientOptions): HttpClient {
  const { manifest } = opts;
  const transport = opts.transport ?? fetchTransport;
  const sleep = opts.sleep ?? defaultSleep;
  const random = opts.random ?? Math.random;
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const log = opts.log && redacting(opts.log);
  const allowed = createAllowList(manifest.readOnlyAllowList);
  const isLogin = createAllowList(manifest.auth.loginRequest ? [manifest.auth.loginRequest] : []);
  const base = new URL(manifest.network.baseUrl);

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
    const headers: Record<string, string> = { accept: 'application/json', ...options.headers };
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
    if (!allowed(method, url.pathname)) {
      throw new ProviderPolicyError(`${method} ${url.pathname} is not in the read-only allow-list`);
    }
    // the manifest decides what a login is; the provider's flag can only add to it, never hide one
    const login = options.login === true || isLogin(method, url.pathname);
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
        if (!RETRY_STATUS(res.status) || attempt >= attempts) return res;
        const retryAfter = Number(res.headers['retry-after']);
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff(attempt);
        // a server asking for more than the cap gets no retry in this run; the planner tries again later
        if (wait > MAX_RETRY_WAIT_MS) return res;
        await sleep(wait);
      } catch (err) {
        if (err instanceof ProviderPolicyError || attempt >= attempts) throw err;
        log?.warn('http network error', { method, path: url.pathname, attempt });
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
