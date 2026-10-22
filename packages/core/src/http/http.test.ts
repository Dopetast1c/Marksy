import { describe, expect, it } from 'vitest';
import { ProviderPolicyError } from '../providers/errors';
import type { DiaryProvider } from '../providers/types';
import { providerManifest } from '../providers/manifest';
import { sampleManifest } from '../testing/samples';
import { createAllowList } from './allow-list';
import { createLogger } from './logger';
import { createMemoryDrift, createRunContext } from './run-context';
import { createThrottledClient } from './throttled-client';
import type { Transport, TransportRequest } from './throttled-client';

function harness(statuses: (number | Error)[] = [], manifest = sampleManifest) {
  const calls: TransportRequest[] = [];
  const sleeps: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const transport: Transport = async (req) => {
    calls.push(req);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--;
    const next = statuses.shift() ?? 200;
    if (next instanceof Error) throw next;
    return {
      status: next,
      headers: (next === 429 ? { 'retry-after': '120' } : {}) as Record<string, string>,
      text: '{"ok":true}',
    };
  };
  const client = createThrottledClient({
    manifest,
    transport,
    sleep: async (ms) => void sleeps.push(ms),
    random: () => 0.5,
  });
  return { client, calls, sleeps, maxInFlight: () => maxInFlight };
}

describe('allow-list', () => {
  const allowed = createAllowList(['GET /diary/**', 'GET /me', 'POST /auth/login/*']);
  it('matches method and path patterns', () => {
    expect(allowed('GET', '/diary')).toBe(true);
    expect(allowed('GET', '/diary/weeks/12/lessons')).toBe(true);
    expect(allowed('GET', '/me?x=1')).toBe(true);
    expect(allowed('POST', '/auth/login/parent')).toBe(true);
    expect(allowed('POST', '/auth/login/a/b')).toBe(false);
    expect(allowed('POST', '/diary/weeks/12')).toBe(false);
    expect(allowed('GET', '/mee')).toBe(false);
    expect(allowed('GET', '/diary/../admin')).toBe(false);
  });
});

describe('throttled client', () => {
  it('is strictly serial with a pause from the manifest between requests', async () => {
    const h = harness();
    const res = await Promise.all([h.client.get('/me'), h.client.get('/diary/1'), h.client.get('/diary/2')]);
    expect(res.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(h.maxInFlight()).toBe(1);
    expect(h.calls.map((c) => new URL(c.url).pathname)).toEqual(['/me', '/diary/1', '/diary/2']);
    expect(h.sleeps).toEqual([2250, 2250]);
    expect(res[0]!.json()).toEqual({ ok: true });
  });

  it('refuses anything outside the allow-list, other hosts and odd paths, without sending', async () => {
    const h = harness();
    await expect(h.client.post('/diary/1', {})).rejects.toBeInstanceOf(ProviderPolicyError);
    await expect(h.client.get('/admin')).rejects.toBeInstanceOf(ProviderPolicyError);
    await expect(h.client.get('https://elsewhere.example.com/diary/1')).rejects.toBeInstanceOf(ProviderPolicyError);
    await expect(h.client.get('//elsewhere.example.com/diary/1')).rejects.toBeInstanceOf(ProviderPolicyError);
    await expect(h.client.get('/diary/../admin')).rejects.toBeInstanceOf(ProviderPolicyError);
    expect(h.calls).toHaveLength(0);
    // the queue survives a refusal
    expect((await h.client.get('/me')).status).toBe(200);
  });

  it('retries 5xx and network errors with backoff, at most three attempts', async () => {
    const h = harness([503, 502, 200]);
    expect((await h.client.get('/me')).status).toBe(200);
    expect(h.calls).toHaveLength(3);
    // backoff 3000 * 2^n * 1.25, then the regular pause before the next attempt
    expect(h.sleeps).toEqual([7500, 2250, 15000, 2250]);

    const down = harness([503, 503, 503, 200]);
    expect((await down.client.get('/me')).status).toBe(503);
    expect(down.calls).toHaveLength(3);

    const offline = harness([new Error('ECONNRESET'), new Error('ECONNRESET'), new Error('ECONNRESET')]);
    await expect(offline.client.get('/me')).rejects.toThrow('ECONNRESET');
    expect(offline.calls).toHaveLength(3);
  });

  it('does not retry when the server asks to wait longer than a run should', async () => {
    const h = harness([429]);
    expect((await h.client.get('/me')).status).toBe(429);
    expect(h.calls).toHaveLength(1);
  });

  it('never retries a login and allows one per run', async () => {
    const h = harness([503]);
    expect((await h.client.post('/auth/login', { login: 'x' }, { login: true })).status).toBe(503);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0]!.body).toBe('{"login":"x"}');
    await expect(h.client.post('/auth/login', {}, { login: true })).rejects.toThrow(/One login/);
  });

  it('stops at the request budget', async () => {
    const h = harness([], { ...sampleManifest, limits: { ...sampleManifest.limits, maxRequestsPerRun: 2 } });
    await h.client.get('/me');
    await h.client.get('/me');
    await expect(h.client.get('/me')).rejects.toThrow(/budget/);
    expect(h.client.requestCount).toBe(2);
  });

  it('environment limits can only make it stricter', async () => {
    const sleeps: number[] = [];
    const make = (stricter: { requestDelayMs: [number, number] }) =>
      createThrottledClient({
        manifest: sampleManifest,
        stricter,
        transport: async () => ({ status: 200, headers: {}, text: '' }),
        sleep: async (ms) => void sleeps.push(ms),
        random: () => 0,
      });
    const loose = make({ requestDelayMs: [10, 20] });
    await loose.get('/me');
    await loose.get('/me');
    const strict = make({ requestDelayMs: [5000, 6000] });
    await strict.get('/me');
    await strict.get('/me');
    expect(sleeps).toEqual([1500, 5000]);
  });
});

describe('run context', () => {
  it('logs in once per run', async () => {
    let logins = 0;
    const provider = {
      manifest: sampleManifest,
      login: async () => ({ n: ++logins }),
    } as unknown as DiaryProvider;
    const run = createRunContext(provider, { transport: async () => ({ status: 200, headers: {}, text: '' }) });
    await run.login({ login: 'a', password: 'b' });
    await expect(run.login({ login: 'a', password: 'b' })).rejects.toThrow(/One login/);
    expect(logins).toBe(1);
  });

  it('redacts credentials in logs', () => {
    const lines: unknown[] = [];
    const log = createLogger((_l, msg, data) => lines.push([msg, data]));
    log.info('login', { password: 'p', nested: { Authorization: 'jwt', week: 3 }, path: '/me' });
    expect(lines).toEqual([
      ['login', { password: '[redacted]', nested: { Authorization: '[redacted]', week: 3 }, path: '/me' }],
    ]);
  });

  it('records each drift once', () => {
    const d = createMemoryDrift();
    d.report({ kind: 'unknown_field', endpoint: 'lessons', path: 'x' });
    d.report({ kind: 'unknown_field', endpoint: 'lessons', path: 'x' });
    d.report({ kind: 'new_enum_value', endpoint: 'lessons', path: 'kind', sample: 'NEW' });
    expect(d.events).toHaveLength(2);
  });
});

describe('privacy review fixes', () => {
  it('refuses encoded separators, dot and empty segments, broken escapes', () => {
    const allowed = createAllowList(['GET /diary/**', 'GET /children/*/grades']);
    for (const path of [
      '/diary/..%2fadmin',
      '/diary/..%5cadmin',
      '/diary/x%2F..%2F..%2Fauth%2Flogin',
      '/diary/%2e%2e/admin',
      '/diary//admin',
      '/diary/%zz',
      '/children/..%2f..%2fsettings/grades',
    ]) {
      expect(allowed('GET', path), path).toBe(false);
    }
    expect(allowed('GET', '/diary/')).toBe(true);
    expect(allowed('GET', '/diary/week%201')).toBe(true);
  });

  it('treats the manifest login request as a login even without the flag', async () => {
    const h = harness([503, 503]);
    expect((await h.client.post('/auth/login', { login: 'x' })).status).toBe(503);
    expect(h.calls).toHaveLength(1);
    await expect(h.client.post('/auth/login', {})).rejects.toThrow(/One login/);
  });

  it('the manifest refuses write methods, other POSTs and insecure origins', () => {
    const bad = (patch: object) => providerManifest.safeParse({ ...sampleManifest, ...patch }).success;
    expect(bad({ readOnlyAllowList: [...sampleManifest.readOnlyAllowList, 'PUT /profile/password'] })).toBe(false);
    expect(bad({ readOnlyAllowList: [...sampleManifest.readOnlyAllowList, 'DELETE /diary/1'] })).toBe(false);
    expect(bad({ readOnlyAllowList: [...sampleManifest.readOnlyAllowList, 'POST /diary/sign'] })).toBe(false);
    expect(bad({ auth: { ...sampleManifest.auth, loginRequest: 'POST /elsewhere' } })).toBe(false);
    const net = (baseUrl: string) => bad({ network: { ...sampleManifest.network, baseUrl } });
    expect(net('http://api.example.com')).toBe(false);
    expect(net('https://user:pw@example.com')).toBe(false);
    expect(net('https://api.example.com/v1')).toBe(false);
    expect(net('https://api.example.com')).toBe(true);
  });

  it('redacts arrays, names, values, messages and errors, and survives cycles', () => {
    const lines: [string, unknown][] = [];
    const log = createLogger((_l, msg, data) => lines.push([msg, data]));
    const loop: Record<string, unknown> = { a: 1 };
    loop.self = loop;
    const err = Object.assign(new Error('failed for x@example.com'), { response: { text: 'body with a name' } });
    log.info('Bearer abc123 rejected, token eyJhbGciOi.eyJzdWIiOi.c2ln', {
      items: [{ password: 'p', week: 1 }],
      fullName: 'A Person',
      email: 'x@example.com',
      apiKey: 'k',
      url: '/me?access_token=zzz',
      err,
      loop,
    });
    expect(lines[0]).toEqual([
      'Bearer [redacted] rejected, token [redacted]',
      {
        items: [{ password: '[redacted]', week: 1 }],
        fullName: '[redacted]',
        email: '[redacted]',
        apiKey: '[redacted]',
        url: '/me?[redacted]',
        err: { name: 'Error', message: 'failed for [redacted]' },
        loop: { a: 1, self: '[circular]' },
      },
    ]);
  });

  it('a plain logger passed to a run is wrapped', async () => {
    const seen: unknown[] = [];
    const plain = {
      debug: (m: string, d?: unknown) => seen.push([m, d]),
      info: (m: string, d?: unknown) => seen.push([m, d]),
      warn: (m: string, d?: unknown) => seen.push([m, d]),
      error: (m: string, d?: unknown) => seen.push([m, d]),
    };
    const run = createRunContext({ manifest: sampleManifest } as unknown as DiaryProvider, { log: plain });
    run.ctx.log.info('x', { password: 'p' });
    expect(seen).toEqual([['x', { password: '[redacted]' }]]);
  });

  it('keeps only enum-like drift samples', () => {
    const d = createMemoryDrift();
    d.report({ kind: 'new_enum_value', endpoint: 'lessons', path: 'kind', sample: 'MASTERED' });
    d.report({ kind: 'unknown_field', endpoint: 'lessons', path: 'comment', sample: 'Well done, Casey!' });
    expect(d.events.map((e) => e.sample)).toEqual(['MASTERED', undefined]);
  });
});
