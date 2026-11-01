import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, testApp } from '../../test/app';
import { agentWith, connectFamily, CONSENT } from '../../test/connect';
import { resetDb, testDb } from '../../test/db';
import { SESSION_COOKIE } from '../http/session';
import { openApiDocument } from '../openapi';
import { readRuntimeConfig } from './config';
import { holdSync, setSyncEnabled } from './instance';
import { createInternalApp } from './internal';
import { cookiePath, isPrivateAddress, normalizeBasePath } from './network';

// The production runtime (docs/running.md): the base path, two addresses for one app (http at home, https through the
// tunnel), sign-up only for the first family, Swagger behind a session, health with the version and nothing else,
// the internal status of the updater, and no route but login, invites and health answering without a session.

const db = testDb();
const cookieOf = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE}=`)) ?? '';
const LOGIN = { login: 'parent@example.com', password: 'correct horse battery' };

describe('base path and addresses', () => {
  it('normalises BASE_PATH and refuses anything but a plain path', () => {
    expect(normalizeBasePath(undefined)).toBe('');
    expect(normalizeBasePath('/')).toBe('');
    expect(normalizeBasePath('marksy')).toBe('/marksy');
    expect(normalizeBasePath('/marksy/')).toBe('/marksy');
    expect(normalizeBasePath('/home/marksy')).toBe('/home/marksy');
    expect(() => normalizeBasePath('/mark sy')).toThrow();
    expect(() => normalizeBasePath('/a;b')).toThrow();
    expect(cookiePath('')).toBe('/');
    expect(cookiePath('/marksy')).toBe('/marksy');
  });

  it('knows the home network and the containers from the internet', () => {
    for (const ip of [
      '127.0.0.1',
      '::1',
      '10.1.2.3',
      '172.20.0.5',
      '192.168.1.11',
      '::ffff:192.168.0.2',
      'fd00::1',
      'fe80::1',
    ])
      expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['8.8.8.8', '172.32.0.1', '100.64.1.1', '2001:db8::1', '::ffff:1.1.1.1', '', undefined])
      expect(isPrivateAddress(ip), String(ip)).toBe(false);
  });

  it('reads production defaults: sign-up for the first family, Swagger behind a session', () => {
    expect(readRuntimeConfig({})).toMatchObject({ signup: 'open', apiDocs: 'open', basePath: '', internal: null });
    expect(readRuntimeConfig({ NODE_ENV: 'production', BASE_PATH: '/marksy' })).toMatchObject({
      signup: 'first',
      apiDocs: 'session',
      basePath: '/marksy',
      production: true,
    });
    expect(() => readRuntimeConfig({ SIGNUP: 'sometimes' })).toThrow();
    expect(() => readRuntimeConfig({ MARKSY_INTERNAL_TOKEN: 'short' })).toThrow();
  });
});

describe('cookies, proxies and plain http', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  for (const basePath of ['', '/marksy']) {
    it(`the session cookie's Path is the app's own (BASE_PATH "${basePath || '/'}"), HttpOnly, SameSite=Lax`, async () => {
      const agent = agentWith({ basePath });
      await connectFamily(agent);
      const res = await agent.post('/api/auth/login').send(LOGIN);
      const cookie = cookieOf(res);
      expect(cookie).toMatch(new RegExp(`Path=${cookiePath(basePath).replace('/', '\\/')}(;|$)`));
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
      expect(cookie).not.toMatch(/Secure/);
      // the browser sends it to <base>/api/…, which the proxy hands over as /api/…: here it is sent by hand
      const out = await request(testApp({ basePath })).post('/api/auth/logout').set('Cookie', cookie.split(';')[0]!);
      expect(cookieOf(out)).toMatch(new RegExp(`Path=${cookiePath(basePath).replace('/', '\\/')}(;|$)`));
    });
  }

  it('Secure over https from the trusted proxy; the same header from anyone else is ignored', async () => {
    await connectFamily(agentWith());
    const trusted = await request(testApp()).post('/api/auth/login').set('X-Forwarded-Proto', 'https').send(LOGIN);
    expect(cookieOf(trusted)).toMatch(/Secure/);
    // the test client (127.0.0.1) is not the proxy of this configuration: its header means nothing
    const untrusted = await request(testApp({ trustProxy: '10.9.9.0/24' }))
      .post('/api/auth/login')
      .set('X-Forwarded-Proto', 'https')
      .send(LOGIN);
    expect(cookieOf(untrusted)).not.toMatch(/Secure/);
  });

  it('plain http only from private addresses: a forwarded port never shows a login form to the internet', async () => {
    const app = testApp();
    const fromInternet = await request(app).post('/api/auth/login').set('X-Forwarded-For', '8.8.8.8').send(LOGIN);
    expect(fromInternet.status).toBe(403);
    expect(fromInternet.body.error.code).toBe('https_required');
    // through the tunnel (https, as the proxy says) the internet is fine
    const tunnel = await request(app)
      .get('/api/health')
      .set('X-Forwarded-For', '8.8.8.8')
      .set('X-Forwarded-Proto', 'https');
    expect(tunnel.status).toBe(200);
    // the home network over http is fine
    expect((await request(app).get('/api/health').set('X-Forwarded-For', '192.168.1.20')).status).toBe(200);
  });
});

describe('what answers signed out', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  it('health: up, the database answers, the version and commit and nothing more; security headers on', async () => {
    const res = await request(testApp({ version: { version: '1.2.3', commit: 'abc1234' } })).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', version: '1.2.3', commit: 'abc1234' });
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('SIGNUP=first: connecting a diary signed out only while the instance has no family', async () => {
    const first = agentWith({ signup: 'first' });
    expect((await first.get('/api/providers')).status).toBe(200);
    await connectFamily(first);
    // now anyone signed out is refused, the connect screen's list too
    const stranger = agentWith({ signup: 'first' });
    expect((await stranger.get('/api/providers')).status).toBe(403);
    const again = await stranger.post('/api/auth/connect').send({
      providerId: 'demo-full',
      credentials: { login: 'another-diary', password: 'diary-pw-123' },
      role: 'parent',
      user: { login: 'stranger@example.com', password: 'correct horse battery', displayName: 'Stranger' },
      consentVersion: CONSENT,
    });
    expect(again.status).toBe(403);
    expect(again.body.error.code).toBe('signup_closed');
    // the family's own members still see the list (adding a diary from Family, family.title)
    expect((await first.get('/api/providers')).status).toBe(200);
    expect((await agentWith({ signup: 'closed' }).get('/api/providers')).status).toBe(403);
  });

  it('Swagger and the document need a session in production, or are off', async () => {
    const app = testApp({ apiDocs: 'session' });
    expect((await request(app).get('/api/openapi.json')).status).toBe(401);
    expect((await request(app).get('/api/docs/')).status).toBe(401);
    const agent = agentWith({ apiDocs: 'session' });
    await connectFamily(agent);
    expect((await agent.get('/api/openapi.json')).status).toBe(200);
    expect((await request(testApp({ apiDocs: 'off' })).get('/api/openapi.json')).status).toBe(404);
  });

  it('no route answers without a session except login, invites and health', async () => {
    // a family exists, sign-up is closed for strangers and the docs need a session: production
    await connectFamily(agentWith());
    const app = testApp({ signup: 'first', apiDocs: 'session' });
    const allowed = new Set([
      'get /api/health',
      'post /api/auth/login',
      'get /api/invites/{code}',
      'post /api/invites/{code}/accept',
    ]);
    const paths = openApiDocument().paths ?? {};
    const answered: string[] = [];
    for (const [path, ops] of Object.entries(paths)) {
      for (const method of Object.keys(ops as object)) {
        if (allowed.has(`${method} ${path}`)) continue;
        const url = path.replace(/\{[^}]+\}/g, '00000000-0000-4000-8000-000000000000');
        const res = await (request(app) as unknown as Record<string, (u: string) => request.Test>)[method]!(url).send(
          {},
        );
        if (res.status < 300) answered.push(`${method} ${path} ${res.status}`);
      }
    }
    expect(answered).toEqual([]);
    for (const p of ['/api/openapi.json', '/api/docs/']) expect((await request(app).get(p)).status).toBe(401);
  });
});

describe('the internal status and the collector switch', () => {
  beforeEach(() => resetDb(db));
  afterEach(() => {
    holdSync(0);
    return settle();
  });

  const token = 'x'.repeat(40);

  it('answers only with the token, versions and times only', async () => {
    const app = createInternalApp({ db, token, syncEnv: true });
    expect((await request(app).get('/internal/status')).status).toBe(401);
    expect((await request(app).get('/internal/status').set('Authorization', 'Bearer wrong')).status).toBe(401);
    const res = await request(app).get('/internal/status').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sync: { enabled: true, running: 0, heldUntil: null },
      backup: { lastSuccessAt: null },
    });
    expect(res.body.migrations).toBeGreaterThan(10);
    const held = await request(app)
      .post('/internal/hold')
      .set('Authorization', `Bearer ${token}`)
      .send({ minutes: 999 });
    expect(new Date(held.body.heldUntil).getTime() - Date.now()).toBeLessThanOrEqual(30 * 60_000 + 1000);
  });

  it('switched off after a restore or held for an update: "Refresh now" (sync.refresh) answers off and nothing logs in', async () => {
    const agent = agentWith();
    const { connect } = await connectFamily(agent);
    await settle();
    await setSyncEnabled(db, false, 'restored');
    const off = await agent.post('/api/sync/run').send({ accountId: connect.accountId });
    expect(off.body).toMatchObject({ started: false, reason: 'off' });
    await setSyncEnabled(db, true, 'enabled');
    holdSync(Date.now() + 60_000);
    expect((await agent.post('/api/sync/run').send({ accountId: connect.accountId })).body.reason).toBe('off');
  });
});
