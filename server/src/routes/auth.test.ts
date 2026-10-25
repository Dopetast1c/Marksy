import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, testApp } from '../../test/app';
import { agentWith, connectFamily, CONSENT, otherParentTransport } from '../../test/connect';
import { resetDb, testDb } from '../../test/db';
import { diaryAccounts, families, sessions, syncRuns } from '../db/schema';
import type { TransportRequest } from '@marksy/core';
import { demoFullTransport } from '@marksy/registry';
import { SESSION_COOKIE } from '../http/session';
import { jpegWithGps } from '../../test/images';

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

  it('refuses a student diary login, a diary connected already (before any diary login), a refused diary login', async () => {
    const agent = agentWith();
    await connectFamily(agent);
    const body = {
      providerId: 'demo-full',
      credentials: { login: 'diary-user', password: 'x' },
      role: 'parent',
      user: { login: 'other@example.com', password: 'correct horse battery', displayName: 'Папа' },
      consentVersion: CONSENT,
    };
    const log: TransportRequest[] = [];
    const app = testApp({ transportFor: () => demoFullTransport({ log }) });
    expect(
      (
        await request(app)
          .post('/api/auth/connect')
          .send({ ...body, role: 'student' })
      ).body.error.code,
    ).toBe('student_login_not_supported');
    // the same diary login (any case) is refused without a login to the diary
    const again = await request(app)
      .post('/api/auth/connect')
      .send({ ...body, credentials: { login: 'DIARY-USER', password: 'x' } });
    expect(again.body.error.code).toBe('already_connected');
    expect(log).toEqual([]);
    const refusing = testApp({
      transportFor: () => async () => ({ status: 401, headers: {}, text: '{}' }),
    });
    const refused = await request(refusing)
      .post('/api/auth/connect')
      .send({ ...body, credentials: { login: 'someone-else', password: 'x' } });
    expect(refused.status).toBe(401);
    expect(refused.body.error.code).toBe('diary_auth_failed');
    expect(await db.select().from(families)).toHaveLength(1);
  });

  it('a taken Marksy login is told only to someone the diary accepted; the same diary user under another label is refused', async () => {
    await connectFamily(agentWith());
    const taken = {
      providerId: 'demo-full',
      credentials: { login: 'second-parent', password: 'x' },
      role: 'parent',
      user: { login: 'PARENT@example.com', password: 'correct horse battery', displayName: 'Папа' },
      consentVersion: CONSENT,
    };
    // the diary refuses: the answer is about the diary, never about the Marksy login
    const refusing = testApp({ transportFor: () => async () => ({ status: 401, headers: {}, text: '{}' }) });
    expect((await request(refusing).post('/api/auth/connect').send(taken)).body.error.code).toBe('diary_auth_failed');
    // the diary accepts another parent's login: now the taken Marksy login is said
    const other = testApp({ transportFor: () => otherParentTransport(['p-1']) });
    expect((await request(other).post('/api/auth/connect').send(taken)).body.error.code).toBe('login_taken');
    // a second label of the first diary user: refused after the login, which counts as that account's login
    const before = (await db.select().from(diaryAccounts))[0]!.lastLoginAt!;
    const sameUser = await request(testApp({ now: () => new Date(before.getTime() + 60_000) }))
      .post('/api/auth/connect')
      .send({
        ...taken,
        credentials: { login: 'alias-of-diary-user', password: 'x' },
        user: { ...taken.user, login: 'new@example.com' },
      });
    expect(sameUser.body.error.code).toBe('already_connected');
    expect((await db.select().from(diaryAccounts))[0]!.lastLoginAt!.getTime()).toBe(before.getTime() + 60_000);
  });

  it('only the consent text the app shows can be agreed to, before any diary login', async () => {
    const log: TransportRequest[] = [];
    const res = await request(testApp({ transportFor: () => demoFullTransport({ log }) }))
      .post('/api/auth/connect')
      .send({
        providerId: 'demo-full',
        credentials: { login: 'diary-user', password: 'x' },
        role: 'parent',
        user: { login: 'new@example.com', password: 'correct horse battery', displayName: 'Мама' },
        consentVersion: 'an-old-text',
      });
    expect(res.status).toBe(400);
    expect(log).toEqual([]);
    expect(await db.select().from(families)).toHaveLength(0);
  });

  it('connecting is limited per address and per diary login: every try is a diary login', async () => {
    const app = testApp({ transportFor: () => async () => ({ status: 401, headers: {}, text: '{}' }) });
    const body = {
      providerId: 'demo-full',
      credentials: { login: 'guessing', password: 'x' },
      role: 'parent',
      user: { login: 'g@example.com', password: 'correct horse battery', displayName: 'Г' },
      consentVersion: CONSENT,
    };
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await request(app).post('/api/auth/connect').send(body)).status);
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
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

  it('ten wrong tries sent at once: only five are checked', async () => {
    await connectFamily(agentWith());
    const app = testApp();
    const all = await Promise.all(
      Array.from({ length: 10 }, () =>
        request(app).post('/api/auth/login').send({ login: 'parent@example.com', password: 'nope' }),
      ),
    );
    expect(all.filter((r) => r.status === 401)).toHaveLength(5);
    expect(all.filter((r) => r.status === 429)).toHaveLength(5);
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

  it('PATCH /api/me/settings: the person’s own «Подсказки» switch, on until turned off, other settings kept', async () => {
    const agent = agentWith();
    await connectFamily(agent);
    expect((await agent.get('/api/auth/me')).body.user.guidance).toBe(true);
    const off = await agent.patch('/api/me/settings').send({ guidance: false });
    expect(off.status).toBe(200);
    expect(off.body.user.guidance).toBe(false);
    expect((await agent.patch('/api/me/settings').send({})).body.user.guidance).toBe(false);
    expect((await agent.patch('/api/me/settings').send({ guidance: 'no' })).status).toBe(400);
    expect((await request(testApp()).patch('/api/me/settings').send({ guidance: true })).status).toBe(401);
  });

  it('lists the diary systems a family can connect, with their fields', async () => {
    const res = await request(testApp({ allowDemoProviders: false })).get('/api/providers');
    expect(res.status).toBe(200);
    expect(res.body.every((p: { status: string }) => ['stable', 'beta'].includes(p.status))).toBe(true);
    for (const p of res.body) expect(p.auth.fields.length).toBeGreaterThan(0);
  });
});

describe('Оформление', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  it('personal, any part at a time; a wallpaper of one’s own is seen by its owner only', async () => {
    const mama = agentWith();
    await connectFamily(mama);
    expect((await mama.get('/api/auth/me')).body.user.appearance).toMatchObject({
      theme: 'light',
      palette: 'sea',
      background: 'color',
      font: 'manrope',
      opacity: 35,
      hasOwnWallpaper: false,
    });
    const set = await mama.patch('/api/me/settings').send({ appearance: { palette: 'forest', font: 'nunito' } });
    expect(set.body.user.appearance).toMatchObject({ palette: 'forest', font: 'nunito', theme: 'light' });
    expect(
      (await mama.patch('/api/me/settings').send({ appearance: { theme: 'dark' } })).body.user.appearance,
    ).toMatchObject({
      palette: 'forest',
      theme: 'dark',
    });
    expect((await mama.patch('/api/me/settings').send({ appearance: { palette: 'neon' } })).status).toBe(400);
    expect((await mama.patch('/api/me/settings').send({ appearance: { opacity: 5 } })).status).toBe(400);

    const put = await mama.put('/api/me/wallpaper').set('Content-Type', 'image/jpeg').send(jpegWithGps(1200, 900));
    expect(put.body).toEqual({ hasOwnWallpaper: true });
    const got = await mama
      .get('/api/me/wallpaper')
      .buffer(true)
      .parse((res, done) => {
        const parts: Buffer[] = [];
        res.on('data', (c: Buffer) => parts.push(c));
        res.on('end', () => done(null, Buffer.concat(parts)));
      });
    expect(got.status).toBe(200);
    expect((got.body as Buffer).toString('latin1')).not.toContain('GPS');
    await mama.patch('/api/me/settings').send({ appearance: { background: 'wallpaper', wallpaper: 'own' } });
    const first = (await mama.get('/api/auth/me')).body.user.appearance;
    expect(first).toMatchObject({ wallpaper: 'own', hasOwnWallpaper: true, wallpaperVersion: expect.any(String) });
    // another picture, another version: the address changes, so no cached old picture is shown
    await mama.put('/api/me/wallpaper').set('Content-Type', 'image/jpeg').send(jpegWithGps(800, 600));
    expect((await mama.get('/api/auth/me')).body.user.appearance.wallpaperVersion).not.toBe(first.wallpaperVersion);
    // another person has no wallpaper of their own, and sees nobody else's
    const other = agentWith();
    await connectFamily(other, 'other@example.com', 'demo-minimal');
    expect((await other.get('/api/me/wallpaper')).status).toBe(404);
    expect(
      (await mama.put('/api/me/wallpaper').set('Content-Type', 'image/jpeg').send(jpegWithGps(2000, 900))).status,
    ).toBe(400);
    expect((await mama.delete('/api/me/wallpaper')).status).toBe(204);
    expect((await mama.get('/api/me/wallpaper')).status).toBe(404);
    expect((await mama.get('/api/auth/me')).body.user.appearance).toMatchObject({
      wallpaper: 'cell',
      hasOwnWallpaper: false,
    });
  });
});
