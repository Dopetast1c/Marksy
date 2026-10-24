import { createLogger } from '@marksy/core';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settle, testApp } from '../../test/app';
import { CONSENT } from '../../test/connect';
import { resetDb, testDb } from '../../test/db';

const db = testDb();
// a school day of the fictional diary's year
const NOW = new Date('2025-09-19T09:00:00Z');
const DIARY_PASSWORD = 'diary-pw-987';
const MARKSY_PASSWORD = 'correct horse battery';

describe('no route returns or logs a credential (docs/build-plan.md M4)', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  it('the diary password, the Marksy password and the session token appear in no answer and no log line', async () => {
    const lines: string[] = [];
    const log = createLogger((_level, msg, data) => lines.push(`${msg} ${JSON.stringify(data ?? {})}`));
    const console$ = ['log', 'info', 'warn', 'error'].map((k) =>
      vi.spyOn(console, k as 'log').mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(' '))),
    );
    try {
      let first: Promise<unknown> | undefined;
      const app = testApp({ now: () => NOW, log, background: (w) => void (first = w) });
      const agent = request.agent(app);
      const bodies: string[] = [];
      const connect = await agent.post('/api/auth/connect').send({
        providerId: 'demo-full',
        credentials: { login: 'diary-user', password: DIARY_PASSWORD },
        role: 'parent',
        user: { login: 'parent@example.com', password: MARKSY_PASSWORD, displayName: 'Мама' },
        consentVersion: CONSENT,
      });
      await first;
      const token = ([] as string[])
        .concat(connect.headers['set-cookie'] ?? [])[0]!
        .split(';')[0]!
        .split('=')[1]!;
      bodies.push(JSON.stringify(connect.body));
      const me = connect.body as { students: { id: string }[] };
      const kid = me.students[0]!.id;
      const paths = [
        '/api/auth/me',
        '/api/family',
        '/api/family/export',
        '/api/providers',
        '/api/students',
        `/api/students/${kid}/periods`,
        `/api/students/${kid}/overview?period=year`,
        `/api/students/${kid}/marks?period=year`,
        `/api/students/${kid}/subjects?period=year`,
        `/api/students/${kid}/trend?period=month`,
        `/api/students/${kid}/schedule?week=0`,
        `/api/students/${kid}/finals/quarters`,
        `/api/students/${kid}/finals/years`,
        `/api/students/${kid}/absences?period=year`,
        `/api/students/${kid}/events?period=year`,
        `/api/students/${kid}/school`,
        '/api/sync/status',
        '/api/sync/runs',
      ];
      for (const p of paths) {
        const res = await agent.get(p);
        expect(res.status, p).toBe(200);
        bodies.push(JSON.stringify(res.body));
      }
      // a wrong login is logged nowhere either
      await request(app).post('/api/auth/login').send({ login: 'parent@example.com', password: 'wrong-pw-123' });
      for (const text of [...bodies, ...lines]) {
        expect(text).not.toContain(DIARY_PASSWORD);
        expect(text).not.toContain(MARKSY_PASSWORD);
        expect(text).not.toContain('wrong-pw-123');
        expect(text).not.toContain(token);
      }
    } finally {
      for (const c of console$) c.mockRestore();
    }
  });

  it('Swagger describes every route the app answers', async () => {
    const doc = (await request(testApp()).get('/api/openapi.json')).body as { paths: Record<string, object> };
    for (const p of [
      '/api/auth/login',
      '/api/auth/connect',
      '/api/auth/me',
      '/api/family',
      '/api/family/accounts/{id}/matches/{studentId}',
      '/api/invites/{code}/accept',
      '/api/students',
      '/api/students/{id}/overview',
      '/api/students/{id}/marks',
      '/api/students/{id}/subjects/{subjectId}',
      '/api/students/{id}/schedule',
      '/api/students/{id}/finals/quarters',
      '/api/students/{id}/events',
      '/api/students/{id}/school',
      '/api/sync/status',
    ])
      expect(doc.paths, p).toHaveProperty([p]);
    // every route but the public ones asks for the session
    expect((doc.paths['/api/students/{id}/overview'] as { get: { security?: unknown[] } }).get.security).toBeDefined();
    expect((doc.paths['/api/auth/login'] as { post: { security?: unknown[] } }).post.security).toBeUndefined();
  });
});
