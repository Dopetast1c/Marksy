import type { DriftEvent, FinalMark, Lesson } from '@marksy/core';
import { FAKE_UUID_PREFIX, fakeUuid, keepsNumber, keepsString, PLACEHOLDERS } from './sanitize';

// The pieces of `pnpm probe` that do not touch the network or the disk, so they can be tested (docs/build-plan.md M2,
// docs/api-spec.md 10). The probe prints only counts and checklist items: no names, marks, topics or ids.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const D = '/api/v1/education/diary';

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

export interface Sensitive {
  /** Matched anywhere inside a kept string, lower case, 4 characters or more */
  phrases: Set<string>;
  /** Name parts and short values, matched as whole words, lower case */
  words: Set<string>;
  /** Numeric ids, matched as a whole value (a school number must not match inside a timestamp) */
  numbers: Set<string>;
}

const NAME_KEY = /name|fio/i;
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 3);

/**
 * Everything in a raw response that sanitize() does not keep: under any key, a string that is not allowed as it is,
 * a number that is not a timestamp or a counter, an id used as a key. Name parts become whole-word checks.
 */
export function sensitiveValues(
  endpoint: string,
  raw: unknown,
  extra: readonly string[] = [],
  into?: Sensitive,
): Sensitive {
  const out = into ?? { phrases: new Set<string>(), words: new Set<string>(), numbers: new Set<string>() };
  const add = (s: string) => (s.length >= 4 ? out.phrases.add(s.toLowerCase()) : out.words.add(s.toLowerCase()));
  for (const e of extra) if (e && e.length >= 3) add(e);
  const walk = (v: unknown, key: string | null) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (UUID.test(k) && !k.startsWith(FAKE_UUID_PREFIX)) add(k);
        if (/^\d{3,}$/.test(k)) out.numbers.add(k);
        walk(x, k);
      }
    } else if (typeof v === 'number') {
      if (!keepsNumber(key) && Math.abs(v) >= 100) out.numbers.add(String(v));
    } else if (typeof v === 'string') {
      const s = v.trim();
      if (s.length < 3 || s.startsWith(FAKE_UUID_PREFIX) || PLACEHOLDERS.has(s) || keepsString(endpoint, key, v))
        return;
      if (/^\d+$/.test(s)) out.numbers.add(s);
      else add(s);
      if (key !== null && NAME_KEY.test(key)) for (const w of words(s)) out.words.add(w);
    }
  };
  walk(raw, null);
  return out;
}

/** How many sensitive values survived, over all fixtures and route keys. The values themselves are never printed. */
export function countLeaks(sanitised: readonly unknown[], sensitive: Sensitive): number {
  const leaves: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        leaves.push(k.toLowerCase());
        walk(x);
      }
    } else if (typeof v === 'string' || typeof v === 'number') leaves.push(String(v).toLowerCase());
  };
  sanitised.forEach(walk);
  const leafWords = new Set(leaves.flatMap((l) => l.split(/[^\p{L}\d]+/u)));
  const leafSet = new Set(leaves);
  let n = 0;
  for (const p of sensitive.phrases) if (leaves.some((l) => l.includes(p))) n++;
  for (const w of sensitive.words) if (leafWords.has(w)) n++;
  for (const x of sensitive.numbers) if (leafSet.has(x) || leafWords.has(x)) n++;
  return n;
}

/** An enum value as the report may show it: UPPER_SNAKE or "null", anything else is counted as "other". */
export const reportable = (v: string) => (/^([A-Z][A-Z0-9_]{0,39}|null)$/.test(v) ? v : 'other');

export interface ProbeFacts {
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
    `  drift events: ${f.drift.length ? '' : 'none'}`,
    ...f.drift.map((d) => `    ${d.kind} ${d.endpoint} ${d.path}${d.sample ? ` (${d.sample})` : ''}`),
  ];
  return lines.join('\n');
}
