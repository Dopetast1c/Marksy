import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lanAddress, ownAddresses } from './smoke-lan.mjs';

// `pnpm smoke:ui [--host <ip>] [--only seed|own]`: with `pnpm dev:lan` running, opens the app the way a phone does,
// through http://<computer-ip>:5173, in a phone (360 px, touch) and a tablet (820 px), and walks login, «С кого
// начнём?», Главная and Внимание for the fictional demo family (pnpm db:seed) and for the owner's family
// (MARKSY_DEV_EMAIL, MARKSY_DEV_PASSWORD from .env). The same states of docs/mockups.html are shot at the same sizes,
// so every screen has a pair to compare. Screenshots go to data/ui/<run>/ (last three runs kept, never committed);
// the terminal shows file names, statuses and counts only, never a name from the data.

const PORT = 5173;
const OUT = fileURLToPath(new URL('../data/ui', import.meta.url));
const MOCKUPS = new URL('../docs/mockups.html', import.meta.url).href;
const KEEP = 3;

export const DEVICES = {
  phone: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** The prototype's states that match the app's screens: screen id and the demo child */
export const PROTOTYPE_STATES = [
  ['login', 'login', null],
  ['login-connect', 'login', null, { loginMode: 'connect' }],
  ['connect-match', 'connectMatch', null],
  ['pick', 'pick', null],
  ['home-1', 'home', 'k'],
  ['events-1', 'events', 'k'],
  ['home-2', 'home', 'm'],
  ['marks-1', 'marks', 'k'],
  ['marks-2', 'marks', 'm'],
  ['subjects-1', 'subjects', 'k'],
  ['subjects-2', 'subjects', 'm'],
  ['subject-1', 'subject', 'k', { subjectId: null }],
  ['subject-2', 'subject', 'm', { subjectId: null }],
  ['finals', 'finals', 'k', { finalsMode: 'quarters' }],
  ['finals-years', 'finals', 'k', { finalsMode: 'years' }],
];

/** The demo family is fictional and its password is published (server/src/seed/seed.ts) */
const SEED = { key: 'seed', login: 'parent@example.com', password: 'marksy-demo' };

/**
 * Resolves once no API request has been in flight for 400 ms (10 s at most). A single-page app changes screens
 * without loading a document, so Playwright's "networkidle" load state is reached once and never waited for again.
 */
function trackRequests(page) {
  let inFlight = 0;
  let quietSince = Date.now();
  const isApi = (r) => new URL(r.url()).pathname.startsWith('/api/');
  page.on('request', (r) => isApi(r) && inFlight++);
  const done = (r) => {
    if (!isApi(r)) return;
    inFlight = Math.max(0, inFlight - 1);
    if (!inFlight) quietSince = Date.now();
  };
  page.on('requestfinished', done);
  page.on('requestfailed', done);
  return async () => {
    const until = Date.now() + 10_000;
    // the screen may start its requests a moment after the navigation
    await page.waitForTimeout(150);
    while (Date.now() < until && (inFlight > 0 || Date.now() - quietSince < 400)) await page.waitForTimeout(50);
  };
}

function prune() {
  if (!existsSync(OUT)) return;
  const runs = readdirSync(OUT).sort();
  for (const old of runs.slice(0, Math.max(0, runs.length - KEEP + 1))) rmSync(join(OUT, old), { recursive: true });
}

async function shootApp(browser, base, family, device, dir, log) {
  const context = await browser.newContext({ ...DEVICES[device], locale: 'ru-RU' });
  const page = await context.newPage();
  const settle = trackRequests(page);
  const shot = async (name) => {
    const file = join(dir, `app-${family.key}-${device}-${name}.png`);
    await settle();
    await page.screenshot({ path: file, fullPage: true });
    log.push(`ok  ${family.key}/${device}/${name}`);
  };
  try {
    // the screens before sign-in: once per device is enough, they do not depend on the family
    if (family.key === 'seed') {
      await page.goto(`${base}/join/NOCODE`);
      await shot('invite');
      await page.goto(`${base}/login`);
      await page.getByRole('button', { name: /Подключить дневник|Connect a diary/ }).click();
      await shot('login-connect');
    }
    await page.goto(`${base}/login`);
    await shot('login');
    await page.getByLabel(/Логин Marksy|Marksy login/).fill(family.login);
    await page.getByLabel(/^Пароль$|^Password$/).fill(family.password);
    await page.getByRole('button', { name: /Войти|Sign in/ }).click();
    await page.waitForURL(/\/(pick|s\/[^/]+)$/, { timeout: 15_000 });
    const me = await (await page.request.get(`${base}/api/auth/me`)).json();
    const kids = me.students ?? [];
    log.push(`    ${family.key}/${device}: signed in, ${kids.length} children`);
    if (page.url().endsWith('/pick')) await shot('pick');
    for (const [i, kid] of kids.entries()) {
      await page.goto(`${base}/s/${kid.id}`);
      await shot(`home-${i + 1}`);
      await page.goto(`${base}/s/${kid.id}/marks`);
      await shot(`marks-${i + 1}`);
      await page.goto(`${base}/s/${kid.id}/subjects`);
      await shot(`subjects-${i + 1}`);
      // the first subject of the list, as the prototype opens its first one
      const first = await (await page.request.get(`${base}/api/students/${kid.id}/subjects?period=week`)).json();
      const firstId = [...(first.subjects ?? [])].sort((a, b) => a.subject.name.localeCompare(b.subject.name))[0]
        ?.subject.id;
      if (firstId) {
        await page.goto(`${base}/s/${kid.id}/subjects/${firstId}`);
        await shot(`subject-${i + 1}`);
        // the sheet of a child with marks: the goal grid and the colours
        if (kid.gradingScale && kid === kids.find((k) => k.gradingScale)) {
          await page.getByRole('button', { name: /Настройки предмета|Subject settings/ }).click();
          await shot('subject-settings');
          await page.keyboard.press('Escape');
        }
      }
      if (i === 0) {
        await page.goto(`${base}/s/${kid.id}/events`);
        await shot(`events-${i + 1}`);
      }
      // Итоги of the first child with marks (a year without marks has none)
      if (kid.gradingScale && kid === kids.find((k) => k.gradingScale)) {
        await page.goto(`${base}/s/${kid.id}/finals`);
        await shot('finals');
        const years = page.getByRole('button', { name: /^(Годы|Years)$/ });
        if (await years.count()) {
          await years.click();
          await shot('finals-years');
        }
      }
    }
  } catch (err) {
    log.push(`BAD ${family.key}/${device}: ${err.name}`);
  } finally {
    await context.close();
  }
}

async function shootPrototype(browser, device, dir, log) {
  const context = await browser.newContext({ ...DEVICES[device], locale: 'ru-RU' });
  const page = await context.newPage();
  try {
    await page.goto(MOCKUPS);
    for (const [name, screen, student, extra] of PROTOTYPE_STATES) {
      await page.evaluate(
        ([s, k, more]) => {
          /* global state, go */
          // as the prototype's own rail does: a chosen screen counts as a picked child
          state.stack = [];
          state.unpicked = false;
          state.loginMode = 'login';
          if (k) state.student = k;
          Object.assign(state, more ?? {});
          go(s, false);
        },
        [screen, student, extra ?? null],
      );
      await page.waitForTimeout(150);
      await page.locator('#phone').screenshot({ path: join(dir, `proto-${device}-${name}.png`) });
      log.push(`ok  prototype/${device}/${name}`);
    }
  } catch (err) {
    log.push(`BAD prototype/${device}: ${err.name}`);
  } finally {
    await context.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const at = args.indexOf('--host');
  const host = at >= 0 ? args[at + 1] : lanAddress();
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
  if (!host || !ownAddresses().includes(host)) {
    console.error('no address of this computer on the home network; pass one with --host <ip>');
    return 2;
  }
  const base = `http://${host}:${PORT}`;
  try {
    const health = await fetch(`${base}/api/health`);
    if (!health.ok) throw new Error(String(health.status));
  } catch {
    console.error(`nothing answers at ${base}: start pnpm dev:lan first`);
    return 1;
  }
  const families = [SEED];
  const ownLogin = process.env.MARKSY_DEV_EMAIL?.trim();
  if (ownLogin && process.env.MARKSY_DEV_PASSWORD)
    families.push({ key: 'own', login: ownLogin, password: process.env.MARKSY_DEV_PASSWORD });
  const chosen = only ? families.filter((f) => f.key === only) : families;

  const { chromium } = await import('playwright');
  prune();
  const dir = join(OUT, new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const log = [];
  try {
    for (const device of Object.keys(DEVICES)) {
      await shootPrototype(browser, device, dir, log);
      for (const family of chosen) await shootApp(browser, base, family, device, dir, log);
    }
  } finally {
    await browser.close();
  }
  for (const line of log) console.log(line);
  console.log(`smoke:ui: screenshots in ${dir}`);
  return log.some((l) => l.startsWith('BAD')) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main();
