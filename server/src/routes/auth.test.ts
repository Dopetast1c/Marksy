import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, testApp } from '../../test/app';
import { agentWith, connectFamily, CONSENT } from '../../test/connect';
import { resetDb, testDb } from '../../test/db';
import { diaryAccounts, families, sessions, syncRuns } from '../db/schema';
import { SESSION_COOKIE } from '../http/session';

const db = testDb();
const cookieOf = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';

describe('auth: connect, login, logout, me', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  it('connecting a diary creates the family, its admin and a session; the token is stored only as a hash', async () => {
    const agent = agentWith();
    const res = await agent.post('/api/auth/connect').send({
      providerId: 'demo-full',
      credentials: { login: 'diary-user', password: 'diary-pw-123' },
      role: 'parent',
      user: { login: 'parent@example.com', password: 'correct horse battery', displayName: 'Мама' },
      consentVersion: CONSENT,
    });
    expect(res.status).toBe(201);
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i);
    const token = cookie.split(';')[0]!.split('=')[1]!;
    const [row] = await db.select().from(sessions);
    expect(row!.tokenHash).not.toContain(token);
    expect(res.body.family).toMatchObject({ role: 'admin' });
    expect(res.body.students).toHaveLength(2);
    expect(res.body.students[0]).toHaveProperty('capabilities');
    expect(res.body.students.map((s: { gradingScale: unknown }) => s.gradingScale === null).sort()).toEqual([
      false,
      false,
    ]);
    // the consent is recorded, the diary login counts as this hour's, the run log has the connect
    const [family] = await db.select().from(families);
    expect(family).toMatchObject({ consentVersion: CONSENT });
    const [account] = await db.select().from(diaryAccounts);
    expect(account!.lastLoginAt).not.toBeNull();
    expect((await db.select().from(syncRuns)).map((r) => r.kind)).toEqual(['connect']);
    // the password of the diary is in no answer, and stored only encrypted
    expect(JSON.stringify(res.body)).not.toContain('diary-pw-123');
    expect(account!.credentialsEnc!.toString('latin1')).not.toContain('diary-pw-123');
    expect((await agent.get('/api/auth/me')).body.user.login).toBe('parent@example.com');
  });

  it('Secure cookies behind https', async () => {
    const res = await request(testApp({ secureCookies: true }))
      .post('/api/auth/connect')
      .send({
        providerId: 'demo-full',
        credentials: { login: 'diary-user', password: 'x' },
        role: 'parent',
        user: { login: 'parent@example.com', password: 'correct horse battery', displayName: 'Мама' },
        consentVersion: CONSENT,
      });
    expect(cookieOf(res)).toMatch(/Secure/);
  });

  it('refuses a student diary login, a taken Marksy login, a diary connected already, and a refused diary login', async () => {
    const agent = agentWith();
    await connectFamily(agent);
    const body = {
      providerId: 'demo-full',
      credentials: { login: 'diary-user', password: 'x' },
      role: 'parent',
      user: { login: 'other@example.com', password: 'correct horse battery', displayName: 'Папа' },
      consentVersion: CONSENT,
    };
    const app = testApp();
    expect(
      (
        await request(app)
          .post('/api/auth/connect')
          .send({ ...body, role: 'student' })
      ).body.error.code,
    ).toBe('student_login_not_supported');
    expect(
      (
        await request(app)
          .post('/api/auth/connect')
          .send({ ...body, user: { ...body.user, login: 'PARENT@example.com' } })
      ).body.error.code,
    ).toBe('login_taken');
    expect((await request(app).post('/api/auth/connect').send(body)).body.error.code).toBe('already_connected');
    const refusing = testApp({
      transportFor: () => async () => ({ status: 401, headers: {}, text: '{}' }),
    });
    const refused = await request(refusing).post('/api/auth/connect').send(body);
    expect(refused.status).toBe(401);
    expect(refused.body.error.code).toBe('diary_auth_failed');
    expect(await db.select().from(families)).toHaveLength(1);
  });

  it('login: the same answer for an unknown login and a wrong password; five failures then a pause', async () => {
    await connectFamily(agentWith());
    const app = testApp();
    const wrong = await request(app).post('/api/auth/login').send({ login: 'parent@example.com', password: 'nope' });
    const unknown = await request(app).post('/api/auth/login').send({ login: 'nobody@example.com', password: 'nope' });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body).toEqual(unknown.body);
    for (let i = 0; i < 4; i++)
      await request(app).post('/api/auth/login').send({ login: 'parent@example.com', password: 'nope' });
    const paused = await request(app)
      .post('/api/auth/login')
      .send({ login: 'parent@example.com', password: 'correct horse battery' });
    expect(paused.status).toBe(429);
    // a fresh app (another process) lets the right password in
    const ok = await request(testApp())
      .post('/api/auth/login')
      .send({ login: 'PARENT@example.com', password: 'correct horse battery' });
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
  });

  it('logout ends the session; without a session nothing is served', async () => {
    const agent = agentWith();
    await connectFamily(agent);
    expect((await agent.post('/api/auth/logout')).status).toBe(204);
    expect(await db.select().from(sessions)).toEqual([]);
    for (const path of ['/api/auth/me', '/api/family', '/api/family/export'])
      expect((await agent.get(path)).status, path).toBe(401);
    expect((await request(testApp()).get('/api/auth/me').set('Cookie', `${SESSION_COOKIE}=forged`)).status).toBe(401);
  });

  it('PATCH /api/me changes only the person’s own name, language and time zone', async () => {
    const agent = agentWith();
    await connectFamily(agent);
    const res = await agent.patch('/api/me').send({ displayName: 'Мама Тест', locale: 'be', timezone: 'Europe/Minsk' });
    expect(res.body.user).toMatchObject({ displayName: 'Мама Тест', locale: 'be', timezone: 'Europe/Minsk' });
    expect((await agent.patch('/api/me').send({ timezone: 'Mars/Base' })).status).toBe(400);
  });

  it('lists the diary systems a family can connect, with their fields', async () => {
    const res = await request(testApp({ allowDemoProviders: false })).get('/api/providers');
    expect(res.status).toBe(200);
    expect(res.body.every((p: { status: string }) => ['stable', 'beta'].includes(p.status))).toBe(true);
    for (const p of res.body) expect(p.auth.fields.length).toBeGreaterThan(0);
  });
});
