import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { manifestScale, studentYearScale } from '../grading/resolve';
import { createAllowList } from '../http/allow-list';
import { addUnknownFields, createFixtureTransport } from '../http/fixture-transport';
import { createRunContext } from '../http/run-context';
import type { TransportRequest } from '../http/throttled-client';
import * as schemas from '../model/schemas';
import { providerManifest } from '../providers/manifest';
import type { DiaryProvider } from '../providers/types';

// The shared conformance suite (docs/providers.md 8). A provider calls defineConformanceSuite from its own test file;
// `pnpm test:provider <id>` runs it. Fixtures are served through the real throttled client, so the allow-list, the
// single login and the request budget are exercised exactly as in a collector run.

export interface ConformanceOptions {
  provider: DiaryProvider;
  /** Absolute path of the provider's fixtures/ folder */
  fixturesDir: string;
  /** "METHOD /path/pattern" -> fixture file name without .json */
  routes: Record<string, string>;
  /** Fictional credentials for login() */
  credentials?: Record<string, string>;
}

interface Denylist {
  strings?: string[];
  patterns?: string[];
}

export interface CanonicalSnapshot {
  account: schemas.AccountInfo;
  students: Record<
    string,
    {
      calendar: schemas.Calendar;
      subjects: schemas.Subject[];
      lessons?: schemas.Lesson[];
      marks?: schemas.Mark[];
      attendance?: schemas.Attendance[];
      finalMarks?: schemas.FinalMark[];
      homework?: schemas.HomeworkItem[];
      behaviour?: schemas.BehaviourEvent[];
    }
  >;
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function loadFixtures(dir: string, sub = ''): Record<string, unknown> {
  const folder = join(dir, sub);
  if (!existsSync(folder)) return {};
  return Object.fromEntries(
    readdirSync(folder)
      .filter((f) => f.endsWith('.json') && f !== 'denylist.json')
      .map((f) => [f.slice(0, -5), readJson(join(folder, f))]),
  );
}

/** One full read of the account through the provider, the way the collector does it. */
export async function readAll(
  opts: ConformanceOptions,
  fixtures: Record<string, unknown>,
  mutate?: (v: unknown) => unknown,
): Promise<{ snapshot: CanonicalSnapshot; requests: TransportRequest[]; drift: unknown[] }> {
  const { provider } = opts;
  const caps = provider.manifest.capabilities;
  const requests: TransportRequest[] = [];
  const run = createRunContext(provider, {
    transport: createFixtureTransport({ fixtures, routes: opts.routes, mutate, log: requests }),
    sleep: async () => undefined,
    now: () => new Date('2026-10-14T09:00:00Z'),
  });
  const { ctx } = run;
  const session = await run.login(opts.credentials ?? { login: 'demo', password: 'demo' });
  const account = await provider.getAccount(session, ctx);
  const students: CanonicalSnapshot['students'] = {};
  for (const student of account.students) {
    const calendar = await provider.getCalendar(session, student, ctx);
    const range = { from: calendar.schoolYear.start, to: calendar.schoolYear.end };
    const entry: CanonicalSnapshot['students'][string] = {
      calendar,
      subjects: await provider.getSubjects(session, student, ctx),
    };
    if (caps.lessons) entry.lessons = await provider.getLessons!(session, student, range, ctx);
    if (caps.marksPerLesson === 'none' || caps.unattachedMarks) {
      entry.marks = await provider.getMarks!(session, student, range, ctx);
    }
    if (caps.attendance === 'separate') entry.attendance = await provider.getAttendance!(session, student, range, ctx);
    if (caps.finalMarks) entry.finalMarks = await provider.getFinalMarks!(session, student, ctx);
    if (caps.homeworkAssignments) entry.homework = await provider.getHomework!(session, student, range, ctx);
    if (caps.behaviour) entry.behaviour = await provider.getBehaviour!(session, student, range, ctx);
    students[student.externalId] = entry;
  }
  return { snapshot: { account, students }, requests, drift: [...run.drift.events] };
}

function allMarks(s: CanonicalSnapshot['students'][string]): schemas.Mark[] {
  return [...(s.marks ?? []), ...(s.lessons ?? []).flatMap((l) => l.marks)];
}

/** External ids per student and kind; within one list they must be unique (two children may share a subject id). */
function ids(snapshot: CanonicalSnapshot): string[][] {
  return Object.values(snapshot.students).flatMap((s) => [
    s.subjects.map((x) => x.externalId),
    (s.lessons ?? []).map((x) => x.externalId),
    allMarks(s).map((x) => x.externalId),
    (s.attendance ?? []).map((x) => x.externalId),
  ]);
}

function denylistHits(value: unknown, deny: Denylist): string[] {
  const text = JSON.stringify(value);
  const lower = text.toLowerCase();
  return [
    ...(deny.strings ?? []).filter((s) => lower.includes(s.toLowerCase())),
    ...(deny.patterns ?? []).filter((p) => new RegExp(p, 'i').test(text)),
  ];
}

export function defineConformanceSuite(opts: ConformanceOptions): void {
  const { provider, fixturesDir } = opts;
  const manifest = provider.manifest;
  const caps = manifest.capabilities;
  const fixtures = loadFixtures(fixturesDir);
  // Fictional responses before sanitising, to prove sanitize() works. Not "raw/": that name is gitignored because it
  // holds real responses on the owner's machine.
  const unsanitised = loadFixtures(fixturesDir, 'unsanitised');
  const denyPath = join(fixturesDir, 'denylist.json');
  const deny: Denylist = existsSync(denyPath) ? (readJson(denyPath) as Denylist) : {};
  const expectedPath = join(fixturesDir, 'expected', 'canonical.json');

  describe(`conformance: ${manifest.id}`, () => {
    it('the manifest validates and its grading scale resolves', () => {
      expect(providerManifest.parse(manifest)).toEqual(manifest);
      expect(manifestScale(manifest).id).toBeTruthy();
    });

    it('implements the methods its capabilities promise', () => {
      const need = (cond: boolean, method: keyof DiaryProvider) => {
        if (cond) expect(typeof provider[method], `${method} is required by the capabilities`).toBe('function');
      };
      need(caps.lessons, 'getLessons');
      need(caps.marksPerLesson === 'none' || caps.unattachedMarks, 'getMarks');
      need(caps.attendance === 'separate', 'getAttendance');
      need(caps.finalMarks, 'getFinalMarks');
      need(caps.homeworkAssignments, 'getHomework');
      need(caps.behaviour, 'getBehaviour');
    });

    it('has fixtures and a denylist', () => {
      expect(Object.keys(fixtures).length).toBeGreaterThan(0);
      expect(existsSync(denyPath), 'fixtures/denylist.json').toBe(true);
    });

    it('returns canonical objects only, through allowed requests and one login', async () => {
      const { snapshot, requests } = await readAll(opts, fixtures);
      expect(schemas.accountInfo.safeParse(snapshot.account).success).toBe(true);
      expect(snapshot.account.students.length).toBeGreaterThan(0);
      for (const s of Object.values(snapshot.students)) {
        expect(schemas.calendar.parse(s.calendar)).toEqual(s.calendar);
        for (const x of s.subjects) expect(schemas.subject.parse(x)).toEqual(x);
        for (const x of s.lessons ?? []) expect(schemas.lesson.parse(x)).toEqual(x);
        for (const x of s.marks ?? []) expect(schemas.mark.parse(x)).toEqual(x);
        for (const x of s.attendance ?? []) expect(schemas.attendance.parse(x)).toEqual(x);
        for (const x of s.finalMarks ?? []) expect(schemas.finalMark.parse(x)).toEqual(x);
        for (const x of s.homework ?? []) expect(schemas.homeworkItem.parse(x)).toEqual(x);
        for (const x of s.behaviour ?? []) expect(schemas.behaviourEvent.parse(x)).toEqual(x);
      }
      const allowed = createAllowList(manifest.readOnlyAllowList);
      for (const r of requests) expect(allowed(r.method, new URL(r.url).pathname), `${r.method} ${r.url}`).toBe(true);
      if (manifest.auth.loginRequest) {
        const isLogin = createAllowList([manifest.auth.loginRequest]);
        const logins = requests.filter((r) => isLogin(r.method, new URL(r.url).pathname));
        expect(logins, 'exactly one login request per run').toHaveLength(1);
      }
    });

    it('keeps ids stable and unique', async () => {
      const a = ids((await readAll(opts, fixtures)).snapshot);
      const b = ids((await readAll(opts, fixtures)).snapshot);
      expect(a).toEqual(b);
      for (const list of a) expect(new Set(list).size).toBe(list.length);
    });

    it('parses marks onto the scale', async () => {
      const { snapshot } = await readAll(opts, fixtures);
      for (const s of Object.values(snapshot.students)) {
        const scale = studentYearScale(manifest, s.calendar);
        for (const m of allMarks(s)) {
          if (m.kind !== 'numeric') {
            expect(m.values, `${m.raw} is ${m.kind}, so it has no values`).toEqual([]);
            continue;
          }
          expect(scale, 'numeric marks in a year without marks').not.toBeNull();
          expect(m.values.length, `numeric ${m.raw} has values`).toBeGreaterThan(0);
          for (const v of m.values) {
            expect(v).toBeGreaterThanOrEqual(scale!.min);
            expect(v).toBeLessThanOrEqual(scale!.max);
          }
        }
      }
    });

    it('tolerates unknown fields everywhere', async () => {
      const plain = await readAll(opts, fixtures);
      const mutated = await readAll(opts, fixtures, addUnknownFields);
      expect(mutated.snapshot).toEqual(plain.snapshot);
    });

    it('sanitises: fixtures are clean and sanitize() leaves nothing on the denylist', () => {
      for (const [name, value] of Object.entries(fixtures)) {
        expect(denylistHits(value, deny), `fixtures/${name}.json`).toEqual([]);
        expect(provider.sanitize(name, value), `sanitize() changes the sanitised fixtures/${name}.json`).toEqual(value);
      }
      expect(Object.keys(unsanitised).length, 'at least one fictional sample in fixtures/unsanitised/').toBeGreaterThan(
        0,
      );
      for (const [name, value] of Object.entries(unsanitised)) {
        expect(
          denylistHits(value, deny).length,
          `unsanitised/${name}.json shows what the denylist catches`,
        ).toBeGreaterThan(0);
        expect(denylistHits(provider.sanitize(name, value), deny), `sanitize(unsanitised/${name}.json)`).toEqual([]);
      }
      if (existsSync(expectedPath))
        expect(denylistHits(readJson(expectedPath), deny), 'expected/canonical.json').toEqual([]);
    });

    it('matches fixtures/expected/canonical.json', async () => {
      const { snapshot } = await readAll(opts, fixtures);
      // MARKSY_UPDATE_EXPECTED=1 rewrites the file; review the diff before committing it. Nothing is written while any
      // fixture or the output itself carries something on the denylist: an unsanitised response must not leak into it.
      if (process.env.MARKSY_UPDATE_EXPECTED === '1') {
        const leaks = [...Object.values(fixtures), snapshot].flatMap((v) => denylistHits(v, deny));
        expect(leaks, 'refusing to write expected/canonical.json').toEqual([]);
        mkdirSync(join(fixturesDir, 'expected'), { recursive: true });
        writeFileSync(expectedPath, `${JSON.stringify(snapshot, null, 2)}\n`);
      }
      expect(existsSync(expectedPath), 'fixtures/expected/canonical.json').toBe(true);
      expect(snapshot).toEqual(readJson(expectedPath));
    });
  });
}
