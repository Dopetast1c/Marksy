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
import { byEschools, manifest, recentWeekRanges, roomFactsOf } from '../src/index';
import {
  endpointName,
  findLeaks,
  MAX_WEEKS,
  report,
  reportable,
  sanitisedRoute,
  sensitiveValues,
  shapeOf,
  weeksArg,
} from '../src/probe';
import { sanitize } from '../src/sanitize';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));

interface Recorded {
  method: string;
  url: URL;
  status: number;
  text: string;
}

/** Parsed JSON, or the text as it is */
function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function main(): Promise<number> {
  // checked before anything touches the network
  const weeksWanted = weeksArg(process.argv.slice(2));
  if (weeksWanted === null) {
    console.error(`--weeks takes a whole number from 1 to ${MAX_WEEKS}.`);
    return 2;
  }
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

  // the read, once per endpoint: login, me, classes, calendar, weeks, subjects, the recent weeks' lessons, finals;
  // strictly one request after another with the manifest's pauses (the shared client enforces both)
  const session = await run.login({ login, password });
  const account = await byEschools.getAccount(session, ctx);
  const today = toISODate(Date.now(), manifest.timezone);
  const recentWeeks = await recentWeekRanges(session, ctx, today, weeksWanted);
  // calendar (2, once), then per student: subjects, one request per week, finals, and the school details (6.7a, the
  // class timetable and teaching plan), plus bells and rooms once per school
  const schoolIds = [...new Set(account.students.map((s) => s.schoolId).filter((x): x is string => !!x))];
  const needed = 2 + account.students.length * (5 + recentWeeks.length) + 2 * schoolIds.length;
  const left = manifest.limits.maxRequestsPerRun - ctx.http.requestCount;
  if (needed > left) {
    console.error(
      `--weeks ${weeksWanted} needs about ${needed} more requests, the manifest allows ${left} in one run.`,
    );
    return 2;
  }
  console.log(
    `Reading ${recentWeeks.length} week(s) for ${account.students.length} student(s), about ${needed + ctx.http.requestCount} requests.`,
  );
  const perStudent = [];
  for (const student of account.students) {
    const calendar = await byEschools.getCalendar(session, student, ctx);
    const subjects = await byEschools.getSubjects(session, student, ctx);
    const lessons = [];
    // one request per week, so each week becomes its own fixture
    for (const week of recentWeeks) lessons.push(...(await byEschools.getLessons!(session, student, week, ctx)));
    const finals = await byEschools.getFinalMarks!(session, student, ctx);
    // school details, read after the lessons as the collector does: subjects come back with teacher, group, level
    const bellSchedules = await byEschools.getBellSchedule!(session, student, ctx);
    const weekTemplate = await byEschools.getWeekTemplate!(session, student, ctx);
    const detailed = await byEschools.getSubjects(session, student, ctx);
    // no request: the timetable, plan and rooms are in the session's cache
    const rooms = await roomFactsOf(session, student, ctx);
    perStudent.push({ student, calendar, subjects, lessons, finals, bellSchedules, weekTemplate, detailed, rooms });
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
      account.students.map((s) => s.classExternalId ?? ''),
      schoolIds,
    );
    let raw = safeJson(r.text);
    if (name === 'login') raw = { auth_token: '[token]', refresh_token: '[token]' };
    writeFileSync(
      join(rawDir, `${String(i + 1).padStart(2, '0')}-${name ?? 'other'}.json`),
      JSON.stringify(raw, null, 2),
    );
    if (name && r.status === 200) named.push({ name, route: sanitisedRoute(r.method, r.url), raw });
  });

  // everything sanitize() does not keep, from every response, every URL and the login itself, is checked against
  // what is about to be written: the fixtures and the route keys
  const loginRaw = recorded.find((r) => r.method === 'POST');
  const sensitive = sensitiveValues('login', loginRaw ? safeJson(loginRaw.text) : null, [login, password]);
  for (const n of named) sensitiveValues(n.name, n.raw, [], sensitive);
  for (const r of recorded) {
    const ids = [
      ...r.url.pathname.split('/').filter((s) => s && !/^[a-z_]+$|^v1$/.test(s)),
      ...r.url.searchParams.values(),
    ];
    sensitiveValues('url', { id: ids.map(decodeURIComponent) }, [], sensitive);
  }
  const sanitised = named.map((n) => ({ ...n, value: sanitize(n.name, n.raw) }));
  const leaks = findLeaks([...sanitised.map((s) => s.value), sanitised.map((s) => s.route)], sensitive);

  const rawKinds: Record<string, number> = {};
  const rawWorkTypes: Record<string, number> = {};
  const rawLessonTypes: Record<string, number> = {};
  // forms of the values the allow-list needs to know, never the values (digits as 9, letters as a)
  const shapes: Record<string, Record<string, number>> = {
    start_time: {},
    'school_year.label': {},
    'time_activities.school_year': {},
  };
  const addShape = (field: string, v: unknown) => (shapes[field]![shapeOf(v)] = (shapes[field]![shapeOf(v)] ?? 0) + 1);
  const yearRaw = named.find((x) => x.name === 'school_year')?.raw as { label?: unknown } | undefined;
  if (yearRaw) addShape('school_year.label', yearRaw.label);
  for (const a of (named.find((x) => x.name === 'time_activities')?.raw as { school_year?: unknown }[]) ?? [])
    addShape('time_activities.school_year', a.school_year);
  for (const n of named.filter((x) => x.name.startsWith('lessons-'))) {
    for (const day of n.raw as {
      slots: { type: string | null; start_time?: unknown; lesson_mark: { kind: string; type: string | null } | null }[];
    }[]) {
      for (const slot of day.slots) {
        addShape('start_time', slot.start_time);
        // enum values only: anything that is not UPPER_SNAKE is counted as "other", never printed
        const count = (m: Record<string, number>, v: unknown) =>
          (m[reportable(String(v))] = (m[reportable(String(v))] ?? 0) + 1);
        count(rawLessonTypes, slot.type);
        if (!slot.lesson_mark) continue;
        count(rawKinds, slot.lesson_mark.kind);
        count(rawWorkTypes, slot.lesson_mark.type);
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
      shapes,
      details: perStudent.map((s) => ({
        bellSchedules: s.bellSchedules.length,
        periods: s.bellSchedules.reduce((n, b) => n + b.periods.length, 0),
        weekEntries: s.weekTemplate?.entries.length ?? 0,
        entriesWithRoom: s.weekTemplate?.entries.filter((e) => e.room).length ?? 0,
        rooms: s.rooms,
        subjectsWithTeacher: s.detailed.filter((x) => x.teacherName).length,
        subjectsWithGroup: s.detailed.filter((x) => x.groupLabel).length,
        subjectsAdvanced: s.detailed.filter((x) => x.level === 'advanced').length,
        lessonsWithTemplate: s.lessons.filter((l) => l.templateRef).length,
      })),
      drift: run.drift.events,
    }),
  );
  console.log('');
  console.log(`Raw responses (this machine only, never commit): data/probe/${stamp}/`);
  console.log('They contain real names and ids: delete the folder when you no longer need it (older runs too).');

  if (leaks.length > 0) {
    // where each surviving value came from, never the value itself
    console.error(`NOT written: values from these places survived sanitize(); fixtures were left as they were:`);
    for (const from of leaks) console.error(`  ${from}`);
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
