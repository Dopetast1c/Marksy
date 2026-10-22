import {
  createMemoryDrift,
  createRunContext,
  ProviderAuthError,
  ProviderBlockedError,
  ProviderUnavailableError,
} from '@marksy/core';
import type { HttpResponse, ProviderContext } from '@marksy/core';
import { describe, expect, it } from 'vitest';
import { byEschools, failure, knownErrorShape } from './index';
import { FAKE_UUID_PREFIX, fakeUuid, sanitize } from './sanitize';

const res = (status: number, text = '', headers: Record<string, string> = {}): HttpResponse => ({
  status,
  headers,
  text,
  json: () => JSON.parse(text),
});
const ctxWithDrift = () => {
  const drift = createMemoryDrift();
  return { drift, ctx: { drift } as unknown as ProviderContext };
};

describe('errors', () => {
  it('a rejected login is an auth failure; a 401 later is an expired token, not a bad password', () => {
    const { ctx } = ctxWithDrift();
    expect(failure(res(401, '{"message":"x"}'), 'login', ctx, true)).toBeInstanceOf(ProviderAuthError);
    expect(failure(res(400, '[{"message":"x","error_code":"E"}]'), 'login', ctx, true)).toBeInstanceOf(
      ProviderAuthError,
    );
    expect(failure(res(401, '{"message":"x"}'), 'lessons', ctx)).toBeInstanceOf(ProviderUnavailableError);
    expect(failure(res(503), 'lessons', ctx)).toBeInstanceOf(ProviderUnavailableError);
    expect(failure(res(403, '"no"'), 'lessons', ctx)).toBeInstanceOf(ProviderBlockedError);
    expect(failure(res(401, '', { 'www-authenticate': 'IC authorization required' }), 'me', ctx)).toBeInstanceOf(
      ProviderBlockedError,
    );
  });

  it('never copies the error text, which may contain the login', () => {
    const { ctx } = ctxWithDrift();
    const e = failure(res(400, '{"details":[{"key":"login","value":"user-login-123 not found"}]}'), 'login', ctx, true);
    expect(e.message).not.toContain('user-login-123');
  });

  it('knows the six error shapes and records any other as drift', () => {
    for (const body of [
      '[{"message":"m","error_code":"c"}]',
      '{"details":[]}',
      '{"errors":[]}',
      '{"content":[]}',
      '{"message":"m"}',
      '{"value":"v"}',
      'plain text',
      '"json string"',
    ])
      expect(knownErrorShape(body), body).toBe(true);
    expect(knownErrorShape('{"fault":{"code":1}}')).toBe(false);
    const { drift, ctx } = ctxWithDrift();
    failure(res(500, '{"fault":{"code":1}}'), 'lessons', ctx);
    expect(drift.events).toEqual([{ kind: 'new_error_shape', endpoint: 'lessons', path: 'error' }]);
  });

  it('logs in once with the manifest login request and stops on a rejection', async () => {
    const calls: string[] = [];
    const run = createRunContext(byEschools, {
      transport: async (req) => {
        calls.push(`${req.method} ${new URL(req.url).pathname}`);
        return { status: 401, headers: {}, text: '{"message":"bad"}' };
      },
      sleep: async () => undefined,
    });
    await expect(run.login({ login: 'x', password: 'y' })).rejects.toBeInstanceOf(ProviderAuthError);
    expect(calls).toEqual(['POST /api/v1/auth/login/parent']);
  });

  it('sends the manifest user agent and the raw token', async () => {
    const seen: Record<string, string>[] = [];
    const run = createRunContext(byEschools, {
      transport: async (req) => {
        seen.push(req.headers);
        return req.method === 'POST'
          ? { status: 200, headers: {}, text: '{"auth_token":"tok","refresh_token":"r"}' }
          : { status: 200, headers: {}, text: '{"user_id":"u","students_for_parent":[]}' };
      },
      sleep: async () => undefined,
    });
    const session = await run.login({ login: 'x', password: 'y' });
    await byEschools.getAccount(session, run.ctx);
    expect(seen[1]).toMatchObject({ authorization: 'tok', 'user-agent': byEschools.manifest.network.userAgent });
  });
});

describe('read-only allow-list (docs/api-spec.md 6.11)', () => {
  it('refuses every write endpoint and every read outside the list, without sending', async () => {
    const sent: string[] = [];
    const run = createRunContext(byEschools, {
      transport: async (req) => {
        sent.push(req.url);
        return { status: 200, headers: {}, text: '{}' };
      },
      sleep: async () => undefined,
    });
    const D = '/api/v1/education/diary/schools/s/students/p';
    for (const [method, path] of [
      ['POST', `${D}/diary_signatures/weekly/activities/w`],
      ['POST', `${D}/diary_signatures/final/activities/q`],
      ['PUT', '/api/v1/admin/schools/parents/u/change/password'],
      ['POST', '/api/v1/admin/schools/parents/forgot-password'],
      ['PUT', '/api/v1/auth/refresh'],
      ['GET', '/api/v1/education/diary/schools/s/classes/c/students/p/master_messages'],
      ['GET', '/api/v1/institution/schools'],
    ] as const) {
      await expect(run.ctx.http.request(method, path), `${method} ${path}`).rejects.toThrow(/allow-list/);
    }
    expect(sent).toEqual([]);
  });
});

describe('sanitize', () => {
  const real = '7d3e2b1a-4c5f-4e6d-9a8b-1c2d3e4f5a6b';

  it('gives one real id the same fake id everywhere, and keeps fake ids', () => {
    expect(fakeUuid(real)).toBe(fakeUuid(real));
    expect(fakeUuid(real).startsWith(FAKE_UUID_PREFIX)).toBe(true);
    expect(fakeUuid(fakeUuid(real))).toBe(fakeUuid(real));
    expect(fakeUuid('another')).not.toBe(fakeUuid(real));
  });

  it('replaces names, free text, tokens and ids, drops contacts, keeps the structure', () => {
    const out = sanitize('me', {
      user_id: real,
      full_name: 'Фамилия Имя Отчество',
      email: 'x@example.com',
      parent_code: 'PC-1',
      auth_token: 'eyJ.x.y',
      students_for_parent: [
        { profile_id: real, full_name: 'Ребёнок Первый' },
        { profile_id: 'b', full_name: 'Ребёнок Второй' },
      ],
      lessons: [{ topic: 'Тема с именем', homework: '', message: null, comment: 'Отлично', subject_title: 'Алгебра' }],
      marks: { [real]: { q: { mark: '8' } } },
    });
    expect(out).toEqual({
      user_id: fakeUuid(real),
      full_name: 'Родитель',
      auth_token: 'fixture-token',
      students_for_parent: [
        { profile_id: fakeUuid(real), full_name: 'Ученик A' },
        { profile_id: fakeUuid('b'), full_name: 'Ученик B' },
      ],
      lessons: [{ topic: 'Тема урока', homework: '', message: null, comment: 'Комментарий', subject_title: 'Алгебра' }],
      marks: { [fakeUuid(real)]: { q: { mark: '8' } } },
    });
    expect(sanitize('me', out)).toEqual(out);
  });
});
