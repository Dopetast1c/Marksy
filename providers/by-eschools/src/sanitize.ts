import { createHmac, randomBytes } from 'node:crypto';

// sanitize() for e-schools.by responses (docs/providers.md 8, CLAUDE.md "Fixtures must be sanitised"). An allow-list:
// only values under keys known to be safe survive (subject names, times, enums, class labels, dates, counters);
// every other string becomes a placeholder and every other number 0, under any key and at any depth, so a field the
// schemas do not know yet (a substitute teacher object, homework as an object, a numeric id) is cleaned too.
// Ids become fake uuids made with a random key that lives only as long as the process: the same real id gives the
// same fake id across one probe run, and nobody holding the real ids can match them afterwards. Running it twice
// changes nothing.

/** Fake uuids live in this namespace; anything already in it is left alone. */
export const FAKE_UUID_PREFIX = '00000000-0000-4000-8000-';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Strings kept as they are, when they also look like what they should be. */
const SAFE_STRINGS: Record<string, RegExp> = {
  subject_title: /^.{1,80}$/s,
  start_time: /^\d{1,2}:\d{2}$/,
  kind: /^[A-Z][A-Z0-9_]{0,39}$/,
  type: /^[A-Z][A-Z0-9_]{0,39}$/,
  title: /^[A-Z][A-Z0-9_]{0,39}$/,
  status: /^[A-Z][A-Z0-9_]{0,39}$/,
  person_kind: /^[A-Z][A-Z0-9_]{0,39}$/,
  roles: /^[A-Z][A-Z0-9_]{0,39}$/,
  // a class letter ("Г") or a school year ("2026/2027")
  label: /^([\p{L}\d]{1,3}|\d{4}\/\d{4})$/u,
  class_number: /^\d{1,2}[\p{L}]{0,3}$/u,
  // a week's "01 сентября - 06 сентября"
  summary: /^\d{1,2} \p{L}+ - \d{1,2} \p{L}+$/u,
  // the mark cell: "8", "7/9" or the diary's short labels
  mark: /^(\d{1,2}(\/\d{1,2})?|н|зач\.|незач\.|освоб\.|осв\.|не осв\.|н\/а)$/,
};
/** Strings that are names of subjects: kept only in the subjects list. */
const SUBJECT_ENDPOINT = /^(subjects|educational_subjects)/;
/** Numbers kept: timestamps, years, positions, levels, flags as numbers. */
const SAFE_NUMBERS = new Set([
  'date',
  'start_ts',
  'end_ts',
  'start_date',
  'end_date',
  'start_year',
  'end_year',
  'graduating_year',
  'dt_disbanded',
  'day_of_week',
  'number',
  'level',
]);
/** Placeholders for text the provider maps, so fixtures still look like lessons. */
const PLACEHOLDER: Record<string, string> = {
  topic: 'Тема урока',
  homework: 'Домашнее задание',
  message: 'Сообщение',
  comment: 'Комментарий',
};
const TOKENS = new Set(['auth_token', 'refresh_token', 'authToken', 'refreshToken']);
/** Dropped entirely: nothing in the app needs them. */
const DROP = new Set(['email', 'phone', 'phone_number', 'mobile', 'birthday', 'birth_date', 'address', 'parent_code']);
const TEXT = '[text]';

const letter = (i: number) => String.fromCharCode(65 + (i % 26));

/** Does sanitize() keep this string as it is? The probe's leak check treats every other string as sensitive. */
export function keepsString(endpoint: string, key: string | null, value: string): boolean {
  if (key === null) return false;
  if (key === 'name' && SUBJECT_ENDPOINT.test(endpoint)) return value.length <= 80;
  return SAFE_STRINGS[key]?.test(value) ?? false;
}

/** Does sanitize() keep this number? */
export function keepsNumber(key: string | null): boolean {
  return key !== null && SAFE_NUMBERS.has(key);
}

export const PLACEHOLDERS: ReadonlySet<string> = new Set(['[text]', 'fixture-token', 'Родитель', 'Ученик']);

export interface Sanitizer {
  sanitize(endpoint: string, raw: unknown): unknown;
  /** The fake uuid of a real id (any string: uuids, numeric ids, codes) */
  fakeId(real: string): string;
}

/** A sanitizer with its own key. The default one gets a random key per process; tests may pass a fixed key. */
export function createSanitizer(key: Buffer = randomBytes(32)): Sanitizer {
  const fakeId = (real: string) =>
    real.startsWith(FAKE_UUID_PREFIX)
      ? real
      : FAKE_UUID_PREFIX + createHmac('sha256', key).update(real).digest('hex').slice(0, 12);

  function walk(
    value: unknown,
    key: string | null,
    ctx: { endpoint: string; inStudents: boolean; index: number },
  ): unknown {
    if (Array.isArray(value)) {
      return value.map((v, i) =>
        walk(v, key, { ...ctx, inStudents: ctx.inStudents || key === 'students_for_parent', index: i }),
      );
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (DROP.has(k)) continue;
        // maps keyed by ids (final/whole: marks[subject][period]) get fake keys too
        out[UUID.test(k) || /^\d{3,}$/.test(k) ? fakeId(k) : k] = walk(v, k, ctx);
      }
      return out;
    }
    if (typeof value === 'number') return keepsNumber(key) ? value : 0;
    if (typeof value !== 'string' || key === null) return value;
    if (value === '' || value.startsWith(FAKE_UUID_PREFIX)) return value;
    if (TOKENS.has(key)) return 'fixture-token';
    if (
      UUID.test(value) ||
      /(^|_)(id|uuid)$/.test(key) ||
      key === 'author' ||
      key === 'school' ||
      key === 'school_year'
    )
      return fakeId(value);
    if (key === 'full_name') return ctx.inStudents ? `Ученик ${letter(ctx.index)}` : 'Родитель';
    if (key in PLACEHOLDER) return value.trim() ? PLACEHOLDER[key] : value;
    if (keepsString(ctx.endpoint, key, value)) return value;
    return TEXT;
  }

  return {
    fakeId,
    sanitize: (endpoint, raw) => walk(raw, null, { endpoint, inStudents: false, index: 0 }),
  };
}

const defaultSanitizer = createSanitizer();

/** Replace names, ids and free text in one raw response (an allow-list by key, see above). */
export function sanitize(endpoint: string, raw: unknown): unknown {
  return defaultSanitizer.sanitize(endpoint, raw);
}

export function fakeUuid(real: string): string {
  return defaultSanitizer.fakeId(real);
}
