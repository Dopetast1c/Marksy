// pnpm probe: one real read of the owner's account, run by the owner from a Belarusian IP (docs/build-plan.md M2).
// Logs in once, calls each read endpoint once, keeps the raw responses in data/probe/ (gitignored), writes sanitised
// fixtures and fixtures/routes.json only when no id, name or text of the raw responses survived sanitising, and prints
// counts and the docs/api-spec.md 10 checklist. Nothing personal is printed. Claude Code never runs this.

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRunContext, fetchTransport, ProviderError } from '@marksy/core';
import type { Transport } from '@marksy/core';
import { dayRange, toISODate } from '../src/dates';
import { byEschools, currentWeekRange, manifest } from '../src/index';
import { countLeaks, endpointName, report, sanitisedRoute, sensitiveStrings } from '../src/probe';
import { sanitize } from '../src/sanitize';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));

interface Recorded {
  method: string;
  url: URL;
  status: number;
  text: string;
}

async function main(): Promise<number> {
  const login = process.env.DIARY_LOGIN;
  const password = process.env.DIARY_PASSWORD;
  if (!login || !password) {
    console.error('Set DIARY_LOGIN and DIARY_PASSWORD in .env (see .env.example), then run pnpm probe again.');
    return 2;
  }

  const recorded: Recorded[] = [];
  const transport: Transport = async (req) => {
    const res = await fetchTransport(req);
    recorded.push({ method: req.method, url: new URL(req.url), status: res.status, text: res.text });
    return res;
  };
  const run = createRunContext(byEschools, { transport });
  const { ctx } = run;

  // the read, exactly once per endpoint: login, me, classes, calendar, weeks, subjects, this week's lessons, finals
  const session = await run.login({ login, password });
  const account = await byEschools.getAccount(session, ctx);
  const today = toISODate(Date.now(), manifest.timezone);
  const week = await currentWeekRange(session, ctx, today);
  const perStudent = [];
  for (const student of account.students) {
    const calendar = await byEschools.getCalendar(session, student, ctx);
    const subjects = await byEschools.getSubjects(session, student, ctx);
    const lessons = week ? await byEschools.getLessons!(session, student, week, ctx) : [];
    const finals = await byEschools.getFinalMarks!(session, student, ctx);
    perStudent.push({ student, calendar, subjects, lessons, finals });
  }

  // name every response; raw ones stay on this machine, the login response without its tokens
  const students = account.students.map((s) => s.externalId);
  const weeksRaw = recorded.find((r) => r.url.pathname.endsWith('/time_activities/week_activities'));
  const weeks: { uuid: string; start_ts: number; end_ts: number }[] = weeksRaw ? JSON.parse(weeksRaw.text) : [];
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawDir = join(root, 'data', 'probe', stamp);
  mkdirSync(rawDir, { recursive: true });
  const named: { name: string; route: string; raw: unknown }[] = [];
  recorded.forEach((r, i) => {
    const name = endpointName(
      r.method,
      r.url,
      students,
      weeks.map((w) => w.uuid),
    );
    let raw: unknown = r.text;
    try {
      raw = JSON.parse(r.text);
    } catch {
      // keep the text
    }
    if (name === 'login') raw = { auth_token: '[token]', refresh_token: '[token]' };
    writeFileSync(
      join(rawDir, `${String(i + 1).padStart(2, '0')}-${name ?? 'other'}.json`),
      JSON.stringify(raw, null, 2),
    );
    if (name && r.status === 200) named.push({ name, route: sanitisedRoute(r.method, r.url), raw });
  });

  const loginRaw = recorded.find((r) => r.method === 'POST');
  const sensitive = new Set<string>();
  for (const n of named) for (const s of sensitiveStrings(n.raw, [login, password])) sensitive.add(s);
  if (loginRaw) for (const s of sensitiveStrings(JSON.parse(loginRaw.text))) sensitive.add(s);
  const sanitised = named.map((n) => ({ ...n, value: sanitize(n.name, n.raw) }));
  const leaks = countLeaks(
    sanitised.map((s) => s.value),
    sensitive,
  );

  const rawKinds: Record<string, number> = {};
  const rawWorkTypes: Record<string, number> = {};
  const rawLessonTypes: Record<string, number> = {};
  for (const n of named.filter((x) => x.name.startsWith('lessons-'))) {
    for (const day of n.raw as {
      slots: { type: string | null; lesson_mark: { kind: string; type: string | null } | null }[];
    }[]) {
      for (const slot of day.slots) {
        rawLessonTypes[String(slot.type)] = (rawLessonTypes[String(slot.type)] ?? 0) + 1;
        if (!slot.lesson_mark) continue;
        rawKinds[slot.lesson_mark.kind] = (rawKinds[slot.lesson_mark.kind] ?? 0) + 1;
        rawWorkTypes[String(slot.lesson_mark.type)] = (rawWorkTypes[String(slot.lesson_mark.type)] ?? 0) + 1;
      }
    }
  }
  const finalCells = named
    .filter((n) => n.name.startsWith('final-'))
    .reduce(
      (sum, n) =>
        sum +
        Object.values((n.raw as { marks: Record<string, object> }).marks ?? {}).reduce(
          (s, p) => s + Object.keys(p).length,
          0,
        ),
      0,
    );
  const days = (w: { start_ts: number; end_ts: number }) => {
    const r = dayRange({ start: w.start_ts, end: w.end_ts }, manifest.timezone);
    return Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1;
  };

  console.log(
    report({
      requests: ctx.http.requestCount,
      loginHasRefreshToken: !!loginRaw && /refresh_token/.test(loginRaw.text),
      students: account.students.length,
      studentsWithoutMarksYear: perStudent.filter((s) => s.calendar.gradingScaleId === null).length,
      nameWords: account.students.map((s) => s.fullName.trim().split(/\s+/).length),
      terms: perStudent[0]?.calendar.terms.length ?? 0,
      holidays: perStudent[0]?.calendar.holidays?.length ?? 0,
      weeks: weeks.length,
      weekLengths: weeks.map(days),
      subjects: perStudent.reduce((n, s) => n + s.subjects.length, 0),
      lessons: perStudent.flatMap((s) => s.lessons),
      finals: perStudent.flatMap((s) => s.finals),
      finalCells,
      rawKinds,
      rawWorkTypes,
      rawLessonTypes,
      drift: run.drift.events,
    }),
  );
  console.log('');
  console.log(`Raw responses (this machine only, never commit): data/probe/${stamp}/`);

  if (leaks > 0) {
    console.error(
      `NOT written: ${leaks} id, name or text value(s) survived sanitize(). Fixtures were left as they were.`,
    );
    return 1;
  }
  // replace the fixture set: old top-level fixtures go, denylist.json and the folders stay
  for (const f of readdirSync(fixturesDir)) {
    if (f.endsWith('.json') && f !== 'denylist.json') rmSync(join(fixturesDir, f));
  }
  for (const s of sanitised)
    writeFileSync(join(fixturesDir, `${s.name}.json`), `${JSON.stringify(s.value, null, 2)}\n`);
  writeFileSync(
    join(fixturesDir, 'routes.json'),
    `${JSON.stringify(Object.fromEntries(sanitised.map((s) => [s.route, s.name])), null, 2)}\n`,
  );
  console.log(`Sanitised fixtures: providers/by-eschools/fixtures/ (${sanitised.length} files and routes.json)`);
  console.log(
    'Next: MARKSY_UPDATE_EXPECTED=1 pnpm test:provider by-eschools, then pnpm privacy, then review git diff.',
  );
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    // the error class only: messages may carry server text
    const kind = err instanceof ProviderError ? err.name : err instanceof Error ? err.name : 'Error';
    console.error(`Probe stopped: ${kind}.`);
    if (kind === 'ProviderAuthError')
      console.error('The diary rejected the login. Check DIARY_LOGIN and DIARY_PASSWORD; do not retry in a loop.');
    if (kind === 'ProviderUnavailableError' || kind === 'TypeError')
      console.error(
        'No answer or 5xx: is a VPN on? Requests must leave from a Belarusian IP without VPN (docs/api-spec.md 9.1).',
      );
    process.exit(1);
  },
);
