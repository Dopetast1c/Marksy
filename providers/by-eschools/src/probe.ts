import type { DriftEvent, FinalMark, Lesson } from '@marksy/core';
import { FAKE_UUID_PREFIX, fakeUuid } from './sanitize';

// The pieces of `pnpm probe` that do not touch the network or the disk, so they can be tested (docs/build-plan.md M2,
// docs/api-spec.md 10). The probe prints only counts and checklist items: no names, marks, topics or ids.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
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

/** The route key of a request with every id replaced the way sanitize() replaces it. */
export function sanitisedRoute(method: string, url: URL): string {
  const fake = (s: string) => s.replace(UUID, (id) => fakeUuid(id));
  const query = [...url.searchParams].map(([k, v]) => `${k}=${fake(v)}`).join('&');
  return `${method} ${fake(url.pathname)}${query ? `?${query}` : ''}`;
}

const SENSITIVE_KEYS =
  /^(user_id|profile_id|school_id|our_school_id|school|uuid|lesson_uuid|lesson_template_id|subject_id|teacher_id|author|time_activity_id|homework_source_id|full_name|first_name|second_name|last_name|middle_name|fio|school_name|position|topic|homework|message|comment|auth_token|refresh_token|parent_code|email|phone|phone_number)$/;

/** Every string in a raw response that must never reach a fixture: ids, names, free text, tokens, contacts. */
export function sensitiveStrings(raw: unknown, extra: readonly string[] = []): Set<string> {
  const out = new Set<string>(extra.filter((s) => s && s.length >= 4));
  const walk = (v: unknown, key: string | null) => {
    if (Array.isArray(v)) v.forEach((x) => walk(x, key));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (k.match(UUID) && !k.startsWith(FAKE_UUID_PREFIX)) out.add(k);
        walk(x, k);
      }
    } else if (typeof v === 'string' && v.trim().length >= 4) {
      if (key !== null && SENSITIVE_KEYS.test(key)) out.add(v.trim());
      for (const id of v.match(UUID) ?? []) if (!id.startsWith(FAKE_UUID_PREFIX)) out.add(id);
    }
  };
  walk(raw, null);
  return out;
}

/** How many sensitive strings survived sanitising, over all fixtures. The values themselves are never printed. */
export function countLeaks(sanitised: readonly unknown[], sensitive: ReadonlySet<string>): number {
  const text = sanitised.map((s) => JSON.stringify(s)).join('\n');
  let n = 0;
  for (const s of sensitive) if (text.includes(s)) n++;
  return n;
}

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
