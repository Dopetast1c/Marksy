import { describe, expect, it } from 'vitest';
import { providerManifest } from '../providers/manifest';
import { ProviderPolicyError } from '../providers/errors';
import type { ProviderManifest } from '../providers/manifest';
import { sampleManifest } from '../testing/samples';
import { createAllowList } from './allow-list';
import { createLogger } from './logger';
import { createMemoryDrift, normaliseDriftPath } from './run-context';
import { createThrottledClient } from './throttled-client';
import type { TransportRequest } from './throttled-client';

// The second privacy review of M1: each test pins one of its findings.

function client(manifest: ProviderManifest, statuses: number[] = []) {
  const calls: TransportRequest[] = [];
  const c = createThrottledClient({
    manifest,
    transport: async (req) => {
      calls.push(req);
      return { status: statuses.shift() ?? 200, headers: {}, text: '{}' };
    },
    sleep: async () => undefined,
    random: () => 0,
  });
  return { c, calls };
}

describe('allow-list: anything a server could read differently never matches', () => {
  const allowed = createAllowList(['GET /diary/**']);
  it.each(['/diary/..;/signature', '/diary/x%3B/y', '/diary/%00', '/diary/%252e%252e/b', '/diary/a b', '/diary/"x"'])(
    '%s',
    (path) => expect(allowed('GET', path)).toBe(false),
  );
  it('ordinary ids, dates and words still match', () => {
    for (const p of [
      '/diary/2026-10-12',
      '/diary/3f2a9c1e-0b7d-4c1a-9e55-1f2d3c4b5a69',
      '/diary/week_12',
      '/diary/a.b',
    ])
      expect(allowed('GET', p), p).toBe(true);
  });
});

describe('login detection', () => {
  it('counts any method on the login path, never retried', async () => {
    const m = { ...sampleManifest, readOnlyAllowList: [...sampleManifest.readOnlyAllowList, 'HEAD /auth/**'] };
    const { c, calls } = client(m, [503, 503, 503]);
    expect((await c.request('HEAD', '/auth/login')).status).toBe(503);
    expect(calls).toHaveLength(1);
    await expect(c.post('/auth/login', {})).rejects.toThrow(/One login/);
  });

  it('ignores case in the path', async () => {
    const m = { ...sampleManifest, readOnlyAllowList: [...sampleManifest.readOnlyAllowList, 'GET /Auth/**'] };
    const { c, calls } = client(m, [503, 503, 503]);
    expect((await c.get('/Auth/Login')).status).toBe(503);
    expect(calls).toHaveLength(1);
  });
});

describe('the client does not trust its manifest object', () => {
  it('refuses write methods and insecure origins even unparsed', () => {
    const put = { ...sampleManifest, readOnlyAllowList: ['PUT /profile/password'] };
    expect(() => client(put)).toThrow(ProviderPolicyError);
    const http = { ...sampleManifest, network: { ...sampleManifest.network, baseUrl: 'http://api.example.com' } };
    expect(() => client(http)).toThrow(/https/);
  });

  it('drops method-override and host headers, refuses a body on GET', async () => {
    const { c, calls } = client(sampleManifest);
    await c.get('/me', { headers: { 'X-HTTP-Method-Override': 'DELETE', Host: 'elsewhere.example.com', 'x-ok': '1' } });
    expect(calls[0]!.headers).toEqual({ accept: 'application/json', 'x-ok': '1' });
    await expect(c.request('GET', '/me', { body: { a: 1 } })).rejects.toThrow(/body/);
    expect(calls).toHaveLength(1);
  });
});

describe('manifest schema', () => {
  const ok = (patch: Partial<ProviderManifest>) => providerManifest.safeParse({ ...sampleManifest, ...patch }).success;
  it('refuses wildcard-only entries', () => {
    for (const entry of ['GET /**', 'GET /*/diary', 'GET /'])
      expect(ok({ readOnlyAllowList: [...sampleManifest.readOnlyAllowList, entry] }), entry).toBe(false);
  });
  it('refuses IP literals and localhost as baseUrl', () => {
    for (const baseUrl of [
      'https://127.0.0.1',
      'https://192.168.1.10',
      'https://localhost',
      'https://[::1]',
      'https://x.localhost',
    ])
      expect(ok({ network: { ...sampleManifest.network, baseUrl } }), baseUrl).toBe(false);
  });
});

describe('logger: strings are allowed, not denied', () => {
  const run = (msg: unknown, data?: Record<string, unknown>) => {
    const lines: [string, unknown][] = [];
    createLogger((_l, m, d) => lines.push([m, d])).info(msg as string, data);
    return lines[0]!;
  };

  it('drops free text and whole responses under any key', () => {
    const [, data] = run('lessons', {
      data: { fio: 'A Person', teacher: 'B Person' },
      unexpected: 'A Person',
      json: '{"password":"x","name":"y"}',
      kind: 'ACHIEVED',
      path: '/diary/week/12',
      week: 12,
      ok: true,
      bytes: Buffer.from('secret'),
      u8: new Uint8Array([1, 2]),
      tags: new Set(['a']),
    });
    expect(data).toEqual({
      data: '[redacted]',
      unexpected: '[redacted]',
      json: '[redacted]',
      kind: 'ACHIEVED',
      path: '/diary/week/12',
      week: 12,
      ok: true,
      bytes: '[binary]',
      u8: '[binary]',
      tags: '[collection]',
    });
  });

  it('scrubs credentials in messages and never throws on a non-string message', () => {
    expect(run('token=abc password: hunter2 Authorization: Basic dXNlcjpwYXNzd29yZA== Cookie: JSESSIONID=1')[0]).toBe(
      'token=[redacted] password=[redacted] Authorization: Basic [redacted] Cookie: [redacted]',
    );
    expect(run({ a: 1 })[0]).toBe('[non-string message]');
    expect(run(new Error('failed for x@example.com'))[0]).toBe('failed for [redacted]');
  });
});

describe('drift events carry shapes, not data', () => {
  it('keeps enum samples, drops ids and logins, replaces ids in paths', () => {
    const d = createMemoryDrift();
    const uuid = '3f2a9c1e-0b7d-4c1a-9e55-1f2d3c4b5a69';
    d.report({ kind: 'new_enum_value', endpoint: 'entries', path: 'entries[].grade.kind', sample: 'ACHIEVED' });
    d.report({ kind: 'unknown_field', endpoint: 'final', path: `marks.${uuid}.q1.x`, sample: uuid });
    d.report({ kind: 'unknown_field', endpoint: 'final', path: `marks.7b1e4d2a-aaaa-4bbb-8ccc-0d1e2f3a4b5c.q1.x` });
    d.report({ kind: 'new_enum_value', endpoint: 'account', path: 'login', sample: 'ivanov.ivan_2015' });
    expect(d.events).toEqual([
      { kind: 'new_enum_value', endpoint: 'entries', path: 'entries[].grade.kind', sample: 'ACHIEVED' },
      { kind: 'unknown_field', endpoint: 'final', path: 'marks.*.q1.x' },
      { kind: 'new_enum_value', endpoint: 'account', path: 'login' },
    ]);
  });

  it('normalises numbers and hex ids in paths', () => {
    expect(normaliseDriftPath('weeks.12.days[].a1b2c3d4e5.mark')).toBe('weeks.*.days[].*.mark');
  });
});
