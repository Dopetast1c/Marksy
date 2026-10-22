import { describe, expect, it } from 'vitest';
import { ProviderPolicyError } from '../providers/errors';
import type { DiaryProvider } from '../providers/types';
import { sampleManifest } from '../testing/samples';
import { createAllowList } from './allow-list';
import { createLogger, createMemoryDrift, createRunContext } from './run-context';
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
