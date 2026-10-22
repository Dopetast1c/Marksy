import type { DriftEvent, FinalMark, Lesson } from '@marksy/core';
import { FAKE_UUID_PREFIX, fakeUuid, keepsNumber, keepsString, PLACEHOLDERS } from './sanitize';
import type { Place } from './sanitize';

// The pieces of `pnpm probe` that do not touch the network or the disk, so they can be tested (docs/build-plan.md M2,
// docs/api-spec.md 10). The probe prints only counts and checklist items: no names, marks, topics or ids.

const D = '/api/v1/education/diary';

export const MAX_WEEKS = 8;

/** --weeks N: how many of the most recent school weeks to read; 1 by default, at most MAX_WEEKS; null if invalid. */
export function weeksArg(argv: readonly string[]): number | null {
  const i = argv.indexOf('--weeks');
  if (i < 0) return 1;
  const n = Number(argv[i + 1]);
  return Number.isInteger(n) && n >= 1 && n <= MAX_WEEKS ? n : null;
}

/** The fixture name of a request: me, classes-1, lessons-2-w1, final-1 ... (students and weeks numbered in order). */
export function endpointName(
  method: string,
  url: URL,
  students: readonly string[],
  weeks: readonly string[],
): string | null {
  const p = url.pathname;
  const student = students.findIndex((s) => p.includes(`/students/${s}`)) + 1;
  if (method === 'POST' && p === '/api/v1/auth/login/parent') return 'login';
  if (p === '/api/v1/admin/auth/me') return 'me';
  if (p === `${D}/school_year`) return 'school_year';
  if (p === `${D}/time_activities`) return 'time_activities';
  if (p === `${D}/time_activities/week_activities`) return 'week_activities';
  if (!student) return null;
  if (p.endsWith('/classes')) return `classes-${student}`;
  if (p.endsWith('/educational_subjects')) return `subjects-${student}`;
  if (p.endsWith('/final/whole')) return `final-${student}`;
  if (p.endsWith('/lessons')) {
    const week = weeks.indexOf(url.searchParams.get('week_activity_uuid') ?? '') + 1;
    return week ? `lessons-${student}-w${week}` : null;
  }
  return null;
}

/** Path segments that are the API's own words; every other segment is an id and gets faked. */
const API_WORDS = new Set([
  'api',
  'v1',
  'auth',
  'login',
  'parent',
  'admin',
  'me',
  'education',
  'diary',
  'school_year',
  'time_activities',
  'week_activities',
  'schools',
  'students',
  'classes',
  'educational_subjects',
  'lessons',
  'final',
  'whole',
]);

/** The route key of a request with every id (any segment that is not an API word, every query value) faked. */
export function sanitisedRoute(method: string, url: URL): string {
  const path = url.pathname
    .split('/')
    .map((s) => (s === '' || API_WORDS.has(s) ? s : fakeUuid(decodeURIComponent(s))))
    .join('/');
  const query = [...url.searchParams].map(([k, v]) => `${k}=${fakeUuid(v)}`).join('&');
  return `${method} ${path}${query ? `?${query}` : ''}`;
}

/** Sensitive values (lower case) and where each was found ("lessons-1-w2: days[].slots[].topic"), never the value. */
export interface Sensitive {
  /** Matched anywhere inside a kept string, 4 characters or more */
  phrases: Map<string, string>;
  /** Name parts and short values, matched as whole words */
  words: Map<string, string>;
  /** Numeric ids, matched as a whole value (a school number must not match inside a timestamp) */
  numbers: Map<string, string>;
}

export const emptySensitive = (): Sensitive => ({ phrases: new Map(), words: new Map(), numbers: new Map() });

const NAME_KEY = /name|fio/i;
const SCHEMA_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const FAKE_ANYWHERE = /00000000-0000-4000-8000-[0-9a-f]{12}/g;
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 3);

/**
 * Everything in a raw response that sanitize() does not keep, with the same rules (keepsString, keepsNumber at the
 * same place): under any key, a string that is not allowed as it is, a number that is not a timestamp or a counter,
 * an id or a word used as a key, any uuid inside a key or a string. Name parts become whole-word checks.
 */
export function sensitiveValues(
  endpoint: string,
  raw: unknown,
  extra: readonly string[] = [],
  into: Sensitive = emptySensitive(),
): Sensitive {
  const out = into;
  const add = (s: string, from: string) => {
    const v = s.toLowerCase();
    if (v.length >= 4) out.phrases.set(v, from);
    else out.words.set(v, from);
  };
  for (const e of extra) if (e && e.length >= 3) add(e, `${endpoint}: credentials`);
  const walk = (v: unknown, place: Place, path: string) => {
    const from = `${endpoint}: ${path || '$'}`;
    if (Array.isArray(v)) v.forEach((x) => walk(x, place, `${path}[]`));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        for (const id of k.match(UUID_ANYWHERE) ?? []) if (!id.startsWith(FAKE_UUID_PREFIX)) add(id, from);
        if (/^\d{3,}$/.test(k)) out.numbers.set(k, from);
        else if (!SCHEMA_KEY.test(k.replace(UUID_ANYWHERE, 'id'))) add(k, from);
        walk(x, { ...place, key: k, container: place.key, depth: place.depth + 1 }, path ? `${path}.${k}` : k);
      }
    } else if (typeof v === 'number') {
      if (!keepsNumber(place) && Math.abs(v) >= 100) out.numbers.set(String(v), from);
    } else if (typeof v === 'string') {
      const s = v.trim();
      for (const id of s.match(UUID_ANYWHERE) ?? []) if (!id.startsWith(FAKE_UUID_PREFIX)) add(id, from);
      if (s.length < 3 || s.startsWith(FAKE_UUID_PREFIX) || PLACEHOLDERS.has(s) || keepsString(place, v)) return;
      if (/^\d+$/.test(s)) out.numbers.set(s, from);
      else add(s, from);
      if (place.key !== null && NAME_KEY.test(place.key)) for (const w of words(s)) out.words.set(w, from);
    }
  };
  walk(raw, { endpoint, key: null, container: null, depth: 0 }, '');
  return out;
}

/**
 * Which sensitive values survived, over all fixtures and route keys: the places they came from, never the values.
 * Fake uuids are taken out of the output first, so their digit groups cannot look like a number from the response.
 */
export function findLeaks(sanitised: readonly unknown[], sensitive: Sensitive): string[] {
  const leaves: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        leaves.push(k.toLowerCase().replace(FAKE_ANYWHERE, ' '));
        walk(x);
      }
    } else if (typeof v === 'string' || typeof v === 'number') {
      leaves.push(String(v).toLowerCase().replace(FAKE_ANYWHERE, ' '));
    }
  };
  sanitised.forEach(walk);
  const leafWords = new Set(leaves.flatMap((l) => l.split(/[^\p{L}\d]+/u)));
  const leafSet = new Set(leaves);
  const found = new Set<string>();
  for (const [p, from] of sensitive.phrases) if (leaves.some((l) => l.includes(p))) found.add(from);
  for (const [w, from] of sensitive.words) if (leafWords.has(w)) found.add(from);
  for (const [x, from] of sensitive.numbers) if (leafSet.has(x) || leafWords.has(x)) found.add(from);
  return [...found].sort();
}

/** How many places leaked (see findLeaks). */
export function countLeaks(sanitised: readonly unknown[], sensitive: Sensitive): number {
  return findLeaks(sanitised, sensitive).length;
}

/** An enum value as the report may show it: UPPER_SNAKE or "null", anything else is counted as "other". */
export const reportable = (v: string) => (/^([A-Z][A-Z0-9_]{0,39}|null)$/.test(v) ? v : 'other');

/**
 * The form of a value without the value: every digit becomes 9, every letter a ("08:30:00" -> "99:99:99"). For
 * fields whose format the allow-list must know (times, year labels); long values are just "long".
 */
export function shapeOf(value: unknown): string {
  if (typeof value !== 'string') return value === null ? 'null' : typeof value;
  if (value.length > 24) return 'long';
  return value.replace(/\d/g, '9').replace(/\p{L}/gu, 'a');
}

export interface ProbeFacts {
  /** field -> shape -> count, see shapeOf */
  shapes?: Record<string, Record<string, number>>;
  requests: number;
  loginHasRefreshToken: boolean;
  students: number;
  studentsWithoutMarksYear: number;
  nameWords: number[];
  terms: number;
  holidays: number;
  weeks: number;
  weekLengths: number[];
  subjects: number;
  lessons: Lesson[];
  finals: FinalMark[];
  finalCells: number;
  rawKinds: Record<string, number>;
  rawWorkTypes: Record<string, number>;
  rawLessonTypes: Record<string, number>;
  drift: readonly DriftEvent[];
}

const tally = (xs: readonly (string | number)[]) =>
  Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {}))
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ') || 'none';
const box = (ok: boolean | null) => (ok === null ? '[?]' : ok ? '[x]' : '[ ]');

/** The console report: counts, enum values and checklist items only. */
export function report(f: ProbeFacts): string {
  const marks = f.lessons.flatMap((l) => l.marks);
  const absences = f.lessons.flatMap((l) => l.attendance ?? []);
  const lines = [
    `Requests: ${f.requests}`,
    '',
    'Records',
    `  students ${f.students} (school years without marks: ${f.studentsWithoutMarksYear})`,
    `  terms ${f.terms}, holidays ${f.holidays}, weeks ${f.weeks}`,
    `  subjects ${f.subjects}, lessons ${f.lessons.length}, marks ${marks.length}, absences ${absences.length}`,
    `  final mark cells ${f.finalCells}, mapped finals ${f.finals.length}`,
    `  mark kinds (raw): ${tally(Object.entries(f.rawKinds).flatMap(([k, n]) => Array<string>(n).fill(k)))}`,
    `  work types (raw): ${tally(Object.entries(f.rawWorkTypes).flatMap(([k, n]) => Array<string>(n).fill(k)))}`,
    `  lesson types (raw): ${tally(Object.entries(f.rawLessonTypes).flatMap(([k, n]) => Array<string>(n).fill(k)))}`,
    '',
    'docs/api-spec.md section 10',
    `  ${box(true)} POST /auth/login/parent answers with auth_token${f.loginHasRefreshToken ? ' and refresh_token' : ''}`,
    `  ${box(null)} PUT /auth/refresh: not used by Marksy, not called`,
    `  ${box(f.finalCells > 0)} final/whole populated${f.finalCells ? `: ${f.finals.length} of ${f.finalCells} cells mapped` : ' (empty until the first quarter ends)'}`,
    `  ${box((f.rawKinds.DOUBLE ?? 0) > 0)} DOUBLE marks seen`,
    `  ${box((f.rawKinds.ABSENT ?? 0) > 0)} ABSENT marks seen`,
    `  ${box(Object.keys(f.rawWorkTypes).some((t) => t !== 'null'))} marks with a non-null type seen`,
    `  ${box(null)} token expiry, student login, lesson_uuid stability: not checked by one probe run`,
    '',
    'Other checks',
    `  week length in days (6 or 7 means end_ts is the last day, 8 means it is the next midnight): ${tally(f.weekLengths)}`,
    `  words in full_name of students (3 means family name, given name, patronymic): ${tally(f.nameWords)}`,
    ...Object.entries(f.shapes ?? {}).map(
      ([field, shapes]) =>
        `  ${field} forms (digits as 9, letters as a): ${Object.entries(shapes)
          .map(([s, n]) => `"${s}": ${n}`)
          .join(', ')}`,
    ),
    `  drift events: ${f.drift.length ? '' : 'none'}`,
    ...f.drift.map((d) => `    ${d.kind} ${d.endpoint} ${d.path}${d.sample ? ` (${d.sample})` : ''}`),
  ];
  return lines.join('\n');
}
