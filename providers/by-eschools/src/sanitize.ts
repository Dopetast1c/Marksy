import { createHash, createHmac, randomBytes } from 'node:crypto';

// sanitize() for e-schools.by responses (docs/providers.md 8, CLAUDE.md "Fixtures must be sanitised" and "never copy
// real values into fixtures"). An allow-list: only values under keys known to be safe, at the place they are known
// to be safe, survive; every other string becomes a placeholder and every other number 0, under any key and at any
// depth. Real values that are kept in shape are replaced in value: marks get random values of the same form, class
// letters become "А". Ids become fake uuids made with a random key that lives only as long as the process: the same
// real id gives the same fake id across one probe run, and nobody holding the real ids can match them afterwards.
// Running it twice changes nothing.

/** Fake uuids live in this namespace; anything already in it is left alone. */
export const FAKE_UUID_PREFIX = '00000000-0000-4000-8000-';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** A key of the API's own schema (snake_case or camelCase English); anything else used as a key is data. */
const SCHEMA_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

const ENUM = /^[A-Z][A-Z0-9_]{0,39}$/;
/** Looks like a person: initials ("И.О.") or three capitalised words ("Иванова Мария Петровна"). */
const PERSON_LIKE = /\p{Lu}\.\s?\p{Lu}\.|(\p{Lu}\p{Ll}+[\s-]+){2}\p{Lu}\p{Ll}+/u;
const MARK_LABELS = /^(н|зач\.|незач\.|освоб\.|осв\.|не осв\.|н\/а)$/;

/** Where we are in the response: the key of the value, the key of the container it sits in, the depth. */
export interface Place {
  endpoint: string;
  key: string | null;
  container: string | null;
  depth: number;
}

/** Does sanitize() keep this string as it is? The probe's leak check treats every other string as sensitive. */
export function keepsString({ endpoint, key, depth }: Place, value: string): boolean {
  switch (key) {
    case 'subject_title':
      return value.length <= 80 && !PERSON_LIKE.test(value);
    case 'name':
      // a subject's name: only directly on the items of the subjects list, never nested deeper
      return (
        /^(subjects|educational_subjects)/.test(endpoint) &&
        depth === 1 &&
        value.length <= 80 &&
        !PERSON_LIKE.test(value)
      );
    case 'start_time':
      return /^\d{1,2}:\d{2}$/.test(value);
    case 'kind':
    case 'type':
    case 'title':
    case 'status':
    case 'person_kind':
    case 'roles':
      return ENUM.test(value);
    case 'label':
      return value === 'А' || /^\d{4}\/\d{4}$/.test(value);
    case 'class_number':
      return /^\d{1,2}А$/.test(value);
    case 'summary':
      // a week's "01 сентября - 06 сентября"
      return /^\d{1,2} \p{Ll}+ - \d{1,2} \p{Ll}+$/u.test(value);
    case 'mark':
      return MARK_LABELS.test(value);
    default:
      return false;
  }
}

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
  'level',
]);

/** Does sanitize() keep this number? A lesson's position only on a lesson slot, never as a school number. */
export function keepsNumber({ key, container }: Place): boolean {
  if (key === 'number') return container === 'slots';
  return key !== null && SAFE_NUMBERS.has(key);
}

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
export const PLACEHOLDERS: ReadonlySet<string> = new Set([
  TEXT,
  'fixture-token',
  'Родитель',
  ...Object.values(PLACEHOLDER),
]);

const letter = (i: number) => String.fromCharCode(65 + (i % 26));

export interface Sanitizer {
  sanitize(endpoint: string, raw: unknown): unknown;
  /** The fake uuid of a real id (any string: uuids, numeric ids, codes) */
  fakeId(real: string): string;
}

/** A sanitizer with its own key. The default one gets a random key per process; tests may pass a fixed key. */
export function createSanitizer(key: Buffer = randomBytes(32)): Sanitizer {
  const mac = (text: string) => createHmac('sha256', key).update(text).digest();
  const fakeId = (real: string) =>
    real.startsWith(FAKE_UUID_PREFIX) ? real : FAKE_UUID_PREFIX + mac(real).toString('hex').slice(0, 12);
  const fakeInside = (s: string) => s.replace(UUID_ANYWHERE, (id) => fakeId(id));
  /**
   * A mark of the same form with other digits. The digits come from the mark's fake id (or the fake keys above it),
   * hashed without a key: that seed is already unlinkable to the real mark and stays the same when a sanitised
   * fixture is sanitised again, so the result is idempotent across runs.
   */
  const fakeMark = (real: string, seed: string) => {
    let i = 0;
    const digit = () => String(1 + (createHash('sha256').update(`${seed}:${i++}`).digest()[0]! % 10));
    return real.replace(/\d{1,2}/g, digit);
  };

  function walk(value: unknown, place: Place, ctx: { inStudents: boolean; index: number; seed: string }): unknown {
    const { key } = place;
    if (Array.isArray(value)) {
      return value.map((v, i) =>
        walk(v, place, { ...ctx, inStudents: ctx.inStudents || key === 'students_for_parent', index: i }),
      );
    }
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      const own = (value as { uuid?: unknown }).uuid;
      const seed = typeof own === 'string' && own ? fakeId(own) : ctx.seed;
      for (const [k, v] of Object.entries(value)) {
        if (DROP.has(k)) continue;
        // maps keyed by ids (final/whole: marks[subject][period]); any key that is not a schema word is data
        const outKey = UUID.test(k) || /^\d{3,}$/.test(k) || !SCHEMA_KEY.test(fakeInside(k)) ? fakeId(k) : k;
        out[outKey] = walk(
          v,
          { ...place, key: k, container: key, depth: place.depth + 1 },
          { ...ctx, seed: `${seed}/${outKey}` },
        );
      }
      return out;
    }
    if (typeof value === 'number') return keepsNumber(place) ? value : 0;
    if (typeof value !== 'string') return value;
    if (key === null) return TEXT;
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
    // a numeric mark keeps its form ("8", "7/9"), never its value
    if (key === 'mark' && /^\d{1,2}(\/\d{1,2})?$/.test(value)) return fakeMark(value, ctx.seed);
    if (key === 'label' && /^\p{L}{1,3}$/u.test(value)) return 'А';
    if (key === 'class_number' && /^\d{1,2}\p{L}{0,3}$/u.test(value)) return `${value.match(/^\d+/)![0]}А`;
    if (keepsString(place, value)) return fakeInside(value);
    return TEXT;
  }

  return {
    fakeId,
    sanitize: (endpoint, raw) =>
      walk(raw, { endpoint, key: null, container: null, depth: 0 }, { inStudents: false, index: 0, seed: endpoint }),
  };
}

const defaultSanitizer = createSanitizer();

/** Replace names, ids, free text and real values in one raw response (an allow-list by key and place, see above). */
export function sanitize(endpoint: string, raw: unknown): unknown {
  return defaultSanitizer.sanitize(endpoint, raw);
}

export function fakeUuid(real: string): string {
  return defaultSanitizer.fakeId(real);
}
