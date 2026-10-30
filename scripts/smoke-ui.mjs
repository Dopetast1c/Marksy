import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lanAddress, ownAddresses } from './smoke-lan.mjs';

// `pnpm smoke:ui [--host <ip>] [--url <production address>] [--only seed|own] [--lang <code>|qps]`: with `pnpm dev:lan`
// running (or, with --url, the production stack at its base path, under its real security policy: any CSP violation
// fails the run), opens the app the way a phone does,
// through http://<computer-ip>:5173, in a phone (360 px, touch) and a tablet (820 px), and walks login, "Who first?"
// (pick.title), Home (screen.home) and Attention (screen.events) for the fictional demo family (pnpm db:seed) and for
// the owner's family (MARKSY_DEV_EMAIL, MARKSY_DEV_PASSWORD from .env), then every child's Marks (screen.marks),
// Subjects (screen.subjects), the subject screen, Finals (finals.screen) and Timetable (screen.schedule). The same states of docs/mockups.html are shot at the same sizes,
// so every screen has a pair to compare. Screenshots go to data/ui/<run>/ (last three runs kept, never committed);
// the terminal shows file names, statuses and counts only, never a name from the data. Every shot is checked for text
// that does not fit (an ellipsis, a spill, a page wider than the screen): a WARN line, quoting the text for the
// fictional family only. --lang shows the app in another language (qps: the pseudo-locale) through the development
// override, so no user changes; then a WARN fails the run.

const PORT = 5173;
const OUT = fileURLToPath(new URL('../data/ui', import.meta.url));
const MOCKUPS = new URL('../docs/mockups.html', import.meta.url).href;
const KEEP = 3;

export const DEVICES = {
  phone: { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

/** The demo student's Appearance (look.title) (server/src/seed/seed.ts), as the prototype's state.look */
const STUDENT_LOOK = {
  theme: 'light',
  bg: 'wallpaper',
  palette: 'sea',
  wall: 'doodle',
  wallUrl: null,
  wallOp: 35,
  font: 'manrope',
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
  ['schedule-1', 'lessons', 'k', { lkind: 'day' }],
  ['schedule-week', 'lessons', 'k', { lkind: 'week' }],
  ['schedule-2', 'lessons', 'm', { lkind: 'day' }],
  ['more', 'more', 'k'],
  // the seed's two children are on two diaries, one login each (server/src/seed/demo-sync.ts)
  ['family', 'family', 'k', { demoSchools: 'diff' }],
  ['sync', 'sync', 'k', { demoSchools: 'diff' }],
  ['look', 'look', 'k'],
  ['avatar', 'avatarEdit', 'k', { avatarFor: 'm' }],
  ['school-bells', 'school', 'k', { schoolTab: 'bells' }],
  ['school-year', 'school', 'k', { schoolTab: 'year' }],
  // last: they leave the prototype in student mode
  // the seed's student has picked a wallpaper
  ['student-home', 'home', 'k', { role: 'student', uiMode: 'full', look: STUDENT_LOOK }],
  ['student-simple-home', 'home', 'k', { role: 'student', uiMode: 'simple', look: STUDENT_LOOK }],
];

/** The demo's student login (server/src/seed/seed.ts), for student mode and simple mode */
const SEED_STUDENT = { login: 'student@example.com', password: 'marksy-demo' };

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

const catalogs = new Map();
/** A language's catalog from packages/i18n, for a production build, which has no development hook */
function catalog(lang) {
  if (!catalogs.has(lang)) {
    const file = new URL(`../packages/i18n/src/locales/${lang}.json`, import.meta.url);
    catalogs.set(lang, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {});
  }
  return catalogs.get(lang);
}

/**
 * The text of an i18n key in the language on screen: buttons and fields are found by key in every language. A
 * development build answers through its hook; a production build is read in the page's language from the catalogs.
 */
export async function say(page, key) {
  /* global window */
  const fromPage = await page.evaluate((k) => (window.__marksyT ? window.__marksyT(k) : null), key);
  if (fromPage !== null) return fromPage;
  const lang = (await page.evaluate(() => document.documentElement.lang)) || 'en';
  return catalog(lang)[key] ?? catalog('en')[key] ?? key;
}

/**
 * What does not fit on the screen just shot (docs/i18n.md 4: no ellipsis in any of the twelve languages): an
 * element's own text that runs past its box (cut by an ellipsis or spilling out), outside horizontal scrollers, and a
 * page wider than the screen. The text itself is measured, so a wider hit area around a button is no overflow. Text
 * from the diary or the family (a subject's name, a teacher's comment, a topic) sits in `data-content` and may be cut.
 */
export async function overflowReport(page) {
  return page.evaluate(() => {
    /* global document, getComputedStyle, Node */
    const scrolls = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const x = getComputedStyle(p).overflowX;
        if (x === 'auto' || x === 'scroll') return true;
      }
      return false;
    };
    const range = document.createRange();
    const cut = [];
    for (const el of document.body.querySelectorAll('*')) {
      const nodes = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (!nodes.length || el.closest('[data-content]') || scrolls(el)) continue;
      const box = el.getBoundingClientRect();
      // text for screen readers only is hidden on purpose
      if (box.bottom < 0 || box.width <= 1 || box.height <= 1) continue;
      range.setStartBefore(nodes[0]);
      range.setEndAfter(nodes.at(-1));
      const text = range.getBoundingClientRect();
      if (text.right <= box.right + 1 && text.left >= box.left - 1) continue;
      cut.push(
        nodes
          .map((n) => n.textContent)
          .join('')
          .trim()
          .slice(0, 40),
      );
    }
    return { cut, wide: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
}

const firstLine = (err) =>
  String(err.message ?? '')
    .split('\n')[0]
    .slice(0, 160);

function prune() {
  if (!existsSync(OUT)) return;
  const runs = readdirSync(OUT).sort();
  for (const old of runs.slice(0, Math.max(0, runs.length - KEEP + 1))) rmSync(join(OUT, old), { recursive: true });
}

/**
 * A browser context for the app. With --lang the app shows that language (or the pseudo-locale qps) through the
 * development override (web/src/i18n), so no user's saved language changes.
 */
async function appContext(browser, device, lang) {
  const context = await browser.newContext({ ...DEVICES[device], locale: 'ru-RU' });
  if (lang) await context.addInitScript((lng) => localStorage.setItem('marksy.lang.override', lng), lang);
  // every blocked script, style, picture or font the page meets (the production CSP, docker/web/web.Caddyfile)
  /* global location */
  await context.addInitScript(() =>
    document.addEventListener('securitypolicyviolation', (e) =>
      console.error(
        `[csp] ${e.effectiveDirective} ${e.blockedURI ? new URL(e.blockedURI, location.href).pathname : 'inline'}`,
      ),
    ),
  );
  return context;
}

/**
 * Fails the run on any CSP violation: the event above, or the browser's own console error about the policy. The line
 * names the directive and the path only (no data from the page).
 */
export function watchCsp(page, label, log) {
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.startsWith('[csp] ')) log.push(`BAD csp ${label}: ${text.slice(6)}`);
    else if (/Content Security Policy/i.test(text)) log.push(`BAD csp ${label}: ${text.split(/[.:]/)[0]}`);
  });
}

/** Shoots the screen and notes what does not fit; texts are printed for the fictional family only */
function shooter(page, settle, { dir, family, device, lang, log }) {
  const file = (name) => join(dir, `app-${family}-${device}${lang ? `-${lang}` : ''}-${name}.png`);
  const label = (name) => `${family}/${device}${lang ? `/${lang}` : ''}/${name}`;
  return async (name) => {
    await settle();
    await page.screenshot({ path: file(name), fullPage: true });
    log.push(`ok  ${label(name)}`);
    const { cut, wide } = await overflowReport(page);
    if (!cut.length && !wide) return;
    const texts = family === 'seed' && cut.length ? `: ${cut.map((c) => JSON.stringify(c)).join(', ')}` : '';
    log.push(`WARN ${label(name)}: ${cut.length} cut${wide ? ', wider than the screen' : ''}${texts}`);
  };
}

async function shootApp(browser, base, family, device, dir, log, lang) {
  const context = await appContext(browser, device, lang);
  const page = await context.newPage();
  watchCsp(page, `${family.key}/${device}`, log);
  const settle = trackRequests(page);
  const shot = shooter(page, settle, { dir, family: family.key, device, lang, log });
  try {
    // the screens before sign-in: once per device is enough, they do not depend on the family
    if (family.key === 'seed') {
      await page.goto(`${base}/join/NOCODE`);
      await shot('invite');
      await page.goto(`${base}/login`);
      await page.getByRole('button', { name: await say(page, 'login.mode.connect') }).click();
      await shot('login-connect');
    }
    await page.goto(`${base}/login`);
    await shot('login');
    await page.getByLabel(await say(page, 'login.marksyLogin')).fill(family.login);
    await page.getByLabel(await say(page, 'login.password'), { exact: true }).fill(family.password);
    // the form's own button: in some languages the mode switch above it has the same word
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(/\/(pick|s\/[^/]+)$/, { timeout: 15_000 });
    const me = await (await page.request.get(`${base}/api/auth/me`)).json();
    const kids = me.students ?? [];
    log.push(`    ${family.key}/${device}: signed in, ${kids.length} children`);
    if (page.url().endsWith('/pick')) await shot('pick');
    await page.goto(`${base}/more`);
    await shot('more');
    await page.goto(`${base}/more/sync`);
    await shot('sync');
    await page.goto(`${base}/more/look`);
    await shot('look');
    // Family (family.title) for the admin and parents, and the first child's avatar screen
    const view = await page.request.get(`${base}/api/family`);
    if (view.ok()) {
      await page.goto(`${base}/more/family`);
      await shot('family');
      const first = (await view.json()).children?.[0]?.studentId;
      if (first) {
        await page.goto(`${base}/more/family/child/${first}`);
        await shot('avatar');
      }
    }
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
          await page.getByRole('button', { name: await say(page, 'subject.settings.title') }).click();
          await shot('subject-settings');
          await page.keyboard.press('Escape');
        }
      }
      if (i === 0) {
        await page.goto(`${base}/s/${kid.id}/events`);
        await shot(`events-${i + 1}`);
      }
      // Timetable (screen.schedule) on the child's next day with lessons from today on, as the prototype opens Day
      // (schedule.day); the first child's
      // week and its lesson menu
      const days = await (await page.request.get(`${base}/api/students/${kid.id}/schedule/days`)).json();
      const next = (days.days ?? []).find((d) => d.date >= days.today)?.date ?? days.today;
      await page.goto(`${base}/s/${kid.id}/schedule?day=${next}`);
      await shot(`schedule-${i + 1}`);
      if (i === 0) {
        const menu = page.getByRole('button', { name: await say(page, 'lessonMenu.open') });
        if (await menu.count()) {
          await menu.first().click();
          await shot('lesson-menu');
          await page.keyboard.press('Escape');
        }
        await page.getByRole('button', { name: await say(page, 'period.week'), exact: true }).click();
        await shot('schedule-week');
      }
      // School (more.school) of the first child: its bells and its school year
      if (i === 0) {
        await page.goto(`${base}/s/${kid.id}/school`);
        await shot('school-bells');
        await page.goto(`${base}/s/${kid.id}/school?tab=year`);
        await shot('school-year');
      }
      // Finals (finals.screen) of the first child with marks (a year without marks has none)
      if (kid.gradingScale && kid === kids.find((k) => k.gradingScale)) {
        await page.goto(`${base}/s/${kid.id}/finals`);
        await shot('finals');
        const years = page.getByRole('button', { name: await say(page, 'finals.years'), exact: true });
        if (await years.count()) {
          await years.click();
          await shot('finals-years');
        }
      }
    }
  } catch (err) {
    // the fictional family's error may be quoted; the own family's may carry names from its data
    log.push(`BAD ${family.key}/${device}: ${err.name}${family.key === 'seed' ? ` ${firstLine(err)}` : ''}`);
  } finally {
    await context.close();
  }
}

/**
 * The demo's student: Home (screen.home) in student mode ("Close to the goal", home.nearGoal.mixed), then simple
 * mode's Home and Timetable (screen.schedule). Simple mode
 * is switched on through the API for the shots and back off afterwards, so the seed stays as it was.
 */
async function shootStudent(browser, base, device, dir, log, lang) {
  const context = await appContext(browser, device, lang);
  const page = await context.newPage();
  watchCsp(page, `seed/${device}/student`, log);
  const settle = trackRequests(page);
  const shot = shooter(page, settle, { dir, family: 'seed', device, lang, log });
  let simple = false;
  try {
    await page.goto(`${base}/login`);
    await page.getByLabel(await say(page, 'login.marksyLogin')).fill(SEED_STUDENT.login);
    await page.getByLabel(await say(page, 'login.password'), { exact: true }).fill(SEED_STUDENT.password);
    // the form's own button: in some languages the mode switch above it has the same word
    await page.locator('form button[type=submit]').click();
    await page.waitForURL(/\/s\/[^/]+$/, { timeout: 15_000 });
    const kid = new URL(page.url()).pathname.split('/')[2];
    await shot('student-home');
    simple = (await page.request.patch(`${base}/api/me`, { data: { uiMode: 'simple' } })).ok();
    await page.goto(`${base}/s/${kid}`);
    await shot('student-simple-home');
    await page.goto(`${base}/s/${kid}/schedule`);
    await shot('student-simple-schedule');
  } catch (err) {
    log.push(`BAD seed/${device}/student: ${err.name} ${firstLine(err)}`);
  } finally {
    if (simple) await page.request.patch(`${base}/api/me`, { data: { uiMode: 'full' } });
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
          state.demoSchools = 'same';
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
  const lang = args.includes('--lang') ? args[args.indexOf('--lang') + 1] : null;
  // --url: the production stack instead of the dev server, at its base path (http://localhost/marksy)
  const url = args.includes('--url') ? args[args.indexOf('--url') + 1]?.replace(/\/+$/, '') : null;
  if (lang !== null && !/^[a-z]{2,3}$/.test(lang ?? '')) {
    console.error('--lang takes a language code: one of the twelve, or qps for the pseudo-locale');
    return 2;
  }
  if (!url && (!host || !ownAddresses().includes(host))) {
    console.error('no address of this computer on the home network; pass one with --host <ip>');
    return 2;
  }
  const base = url ?? `http://${host}:${PORT}`;
  try {
    const health = await fetch(`${base}/api/health`);
    if (!health.ok) throw new Error(String(health.status));
  } catch {
    console.error(`nothing answers at ${base}: start pnpm dev:lan (or the production stack for --url) first`);
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
      for (const family of chosen) await shootApp(browser, base, family, device, dir, log, lang);
      if (chosen.some((f) => f.key === 'seed')) await shootStudent(browser, base, device, dir, log, lang);
    }
  } finally {
    await browser.close();
  }
  for (const line of log) console.log(line);
  const warned = log.filter((l) => l.startsWith('WARN')).length;
  console.log(`smoke:ui: screenshots in ${dir}${warned ? `, ${warned} screens with text that does not fit` : ''}`);
  // in another language a text that does not fit is the failure this run is for
  return log.some((l) => l.startsWith('BAD')) || (lang && warned) ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main();
