import { networkInterfaces } from 'node:os';
import { pathToFileURL } from 'node:url';

// `pnpm smoke:lan [--host <ip>]`: with `pnpm dev:lan` running, signs in to the API through the app server's address on
// the home network (http://<computer-ip>:5173/api), the way a phone does, with MARKSY_DEV_EMAIL and MARKSY_DEV_PASSWORD
// from .env (node --env-file), and walks /auth/me, /students and every read route of each child. It prints statuses,
// counts and response shapes only (keys and types, never values, never names), and fails when a response carries a
// password, the session token or a secret-looking key, or when the session cookie would not work over http.

const PORT = 5173;
const COOKIE = 'marksy_session';
const SECRET_KEYS = /pass(word|wd)|token|secret|credential|cookie|cipher|api_?key|private_?key/i;

/** A key as printed: a key the code defines stays, one that could be data (a name, an id, a date) never shows */
const safeKey = (k) => (/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(k) && !/\d{3}/.test(k) ? k : '<key>');

const PRIVATE = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./];
const VIRTUAL = /vethernet|wsl|docker|virtualbox|vmware|hyper-v|loopback|tailscale|zerotier|vpn|utun|vbox|br-|veth/i;

/** Every IPv4 address of this machine: the password is sent over plain http, so never to another device */
export function ownAddresses(interfaces = networkInterfaces()) {
  return Object.values(interfaces)
    .flatMap((list) => list ?? [])
    .filter((a) => a.family === 'IPv4' || a.family === 4)
    .map((a) => a.address);
}

/** The computer's address on the home network: a private IPv4 of a real adapter, physical ones first */
export function lanAddress(interfaces = networkInterfaces()) {
  const found = [];
  for (const [name, list] of Object.entries(interfaces)) {
    for (const a of list ?? []) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (!v4 || a.internal || !PRIVATE.some((re) => re.test(a.address))) continue;
      found.push({ name, address: a.address, virtual: VIRTUAL.test(name) });
    }
  }
  found.sort((x, y) => Number(x.virtual) - Number(y.virtual));
  return found[0]?.address ?? null;
}

/** A value's shape: keys and types, arrays by their first element and length, never a value */
export function shapeOf(value, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return value.length ? `[${value.length}× ${shapeOf(value[0], depth + 1)}]` : '[]';
  if (typeof value !== 'object') return typeof value;
  if (depth >= 3) return '{…}';
  const keys = Object.keys(value);
  return `{${keys.map((k) => `${safeKey(k)}: ${shapeOf(value[k], depth + 1)}`).join(', ')}}`;
}

/** What a response must never carry: the given secrets anywhere in the text, or a secret-looking key */
export function secretHits(text, secrets) {
  const hits = [];
  for (const [label, value] of Object.entries(secrets)) {
    if (!value || value.length < 4) continue;
    // as typed, and as JSON writes it (a quote or a backslash in a password comes back escaped)
    if (text.includes(value) || text.includes(JSON.stringify(value).slice(1, -1))) hits.push(`contains the ${label}`);
  }
  const walk = (v, path) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (SECRET_KEYS.test(k)) hits.push(`key ${path}.${safeKey(k)}`);
        walk(x, `${path}.${safeKey(k)}`);
      }
  };
  try {
    walk(JSON.parse(text), '$');
  } catch {
    // not JSON: the text check above is all there is
  }
  return hits;
}

/** The session cookie from Set-Cookie and what is wrong with it for a phone over plain http */
export function sessionCookie(setCookies) {
  const line = setCookies.find((c) => c.startsWith(`${COOKIE}=`));
  if (!line) return { token: null, problems: ['no session cookie was set'] };
  const [pair, ...attrs] = line.split(';').map((s) => s.trim());
  const token = pair.slice(COOKIE.length + 1);
  const has = (name) => attrs.some((a) => a.toLowerCase() === name || a.toLowerCase().startsWith(`${name}=`));
  const value = (name) =>
    attrs
      .find((a) => a.toLowerCase().startsWith(`${name}=`))
      ?.split('=')[1]
      ?.toLowerCase();
  const problems = [];
  if (!token) problems.push('the session cookie is empty');
  if (!has('httponly')) problems.push('the session cookie is not HttpOnly');
  if (value('samesite') !== 'lax') problems.push('the session cookie is not SameSite=Lax');
  if (has('secure')) problems.push('the session cookie is Secure: a browser never sends it back over http');
  if (!has('max-age') && !has('expires')) problems.push('the session cookie ends with the browser');
  return { token, problems };
}

/** Counts for the line of one response: the length of an array, or of each top-level array */
export function countsOf(body) {
  if (Array.isArray(body)) return `${body.length} items`;
  if (!body || typeof body !== 'object') return '';
  return Object.entries(body)
    .filter(([, v]) => Array.isArray(v))
    .map(([k, v]) => `${k} ${v.length}`)
    .join(', ');
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--host');
  const host = at >= 0 ? args[at + 1] : lanAddress();
  const login = process.env.MARKSY_DEV_EMAIL?.trim();
  const password = process.env.MARKSY_DEV_PASSWORD ?? '';
  if (!login || !password) {
    console.error('smoke:lan needs MARKSY_DEV_EMAIL and MARKSY_DEV_PASSWORD in .env (see .env.example)');
    return 2;
  }
  if (!host) {
    console.error('no home-network address found; pass one with --host <ip>');
    return 2;
  }
  if (!ownAddresses().includes(host)) {
    console.error('--host must be an address of this computer: the password goes over plain http');
    return 2;
  }
  const base = `http://${host}:${PORT}`;
  const secrets = { 'Marksy password': password, 'diary password': process.env.DIARY_PASSWORD ?? '' };
  const problems = [];
  let cookie = '';

  const call = async (label, path, init = {}) => {
    let res;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        headers: { ...(cookie && { cookie }), ...(init.body && { 'content-type': 'application/json' }) },
        redirect: 'manual',
      });
    } catch (err) {
      return { status: 0, error: err.cause?.code ?? err.name };
    }
    const text = await res.text();
    for (const hit of secretHits(text, { ...secrets, 'session token': cookie.split('=')[1] ?? '' }))
      problems.push(`${label}: ${hit}`);
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = text;
    }
    return { status: res.status, body, setCookies: res.headers.getSetCookie() };
  };
  const report = (label, r, expect = 200) => {
    const ok = r.status === expect;
    if (!ok) problems.push(`${label}: ${r.status || r.error}, expected ${expect}`);
    const counts = r.body && ok ? countsOf(r.body) : '';
    console.log(`${ok ? 'ok ' : 'BAD'} ${r.status} ${label}${counts ? `  (${counts})` : ''}`);
    if (ok && r.body && typeof r.body === 'object') console.log(`      ${shapeOf(r.body)}`);
    return ok;
  };

  console.log(`smoke:lan through ${base} (the app server; /api is proxied to the API)`);
  const health = await call('health', '/api/health');
  if (health.status !== 200) {
    console.error(
      health.status === 0
        ? `nothing answers at ${base} (${health.error}): start pnpm dev:lan, and on Windows allow Node.js on private networks`
        : `GET /api/health answered ${health.status}: is the API running behind pnpm dev:lan?`,
    );
    return 1;
  }
  report('GET /api/health', health);
  report('GET /api/students without a session', await call('anon', '/api/students'), 401);

  const signedIn = await call('login', '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  });
  if (!report('POST /api/auth/login', signedIn)) {
    console.error('sign-in failed: run pnpm dev:connect first, or check MARKSY_DEV_EMAIL and MARKSY_DEV_PASSWORD');
    return 1;
  }
  const session = sessionCookie(signedIn.setCookies ?? []);
  problems.push(...session.problems.map((p) => `cookie: ${p}`));
  console.log(
    `${session.problems.length ? 'BAD' : 'ok '} session cookie: HttpOnly, SameSite=Lax, not Secure over http`,
  );
  cookie = `${COOKIE}=${session.token}`;
  // the login's own answer is checked again now that the token is known
  for (const hit of secretHits(JSON.stringify(signedIn.body), { 'session token': session.token ?? '' }))
    problems.push(`login: ${hit}`);

  report('GET /api/auth/me (the cookie works over http)', await call('me', '/api/auth/me'));
  const students = await call('students', '/api/students');
  report('GET /api/students', students);
  for (const path of ['/api/family', '/api/providers', '/api/sync/status', '/api/sync/runs', '/api/family/export']) {
    const r = await call(path, path);
    report(`GET ${path}`, r, r.status === 403 ? 403 : 200);
  }

  const children = Array.isArray(students.body) ? students.body : [];
  for (const [i, child] of children.entries()) {
    const label = `child ${i + 1}`;
    const id = encodeURIComponent(child.id);
    console.log(`-- ${label}`);
    const routes = [
      'periods',
      'overview',
      'overview?period=quarter',
      'marks?period=quarter',
      'subjects?period=quarter',
      'trend?period=quarter',
      'absences?period=quarter',
      'events?period=quarter',
      'schedule',
      'schedule?day=today',
      // last week has lessons even on a weekend or in the holidays
      'schedule?week=-1',
      'finals/quarters',
      'finals/years',
      'school',
    ];
    let subjects = null;
    for (const route of routes) {
      const r = await call(`${label} ${route}`, `/api/students/${id}/${route}`);
      report(`GET ${label}/${route}`, r);
      if (route.startsWith('subjects')) subjects = r.body;
    }
    const list = Array.isArray(subjects) ? subjects : (subjects?.subjects ?? []);
    const first = list[0]?.id ?? list[0]?.subject?.id;
    if (first) {
      const sid = encodeURIComponent(first);
      for (const route of [`subjects/${sid}?period=quarter`, `subjects/${sid}/trend?period=quarter`])
        report(`GET ${label}/${route.replace(sid, ':subject')}`, await call(label, `/api/students/${id}/${route}`));
    } else console.log(`    ${label}: no subjects in this quarter, the subject routes are skipped`);
  }

  report('POST /api/auth/logout', await call('logout', '/api/auth/logout', { method: 'POST' }), 204);
  report('GET /api/auth/me after logout', await call('me', '/api/auth/me'), 401);

  console.log('');
  if (problems.length) {
    console.log(`smoke:lan: ${problems.length} problem(s)`);
    for (const p of problems) console.log(`  - ${p}`);
    return 1;
  }
  console.log(`smoke:lan: all green, ${children.length} children`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main();
