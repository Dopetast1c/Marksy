import { createHash, createHmac, randomBytes } from 'node:crypto';

// sanitize() for e-schools.by responses (docs/providers.md 8, CLAUDE.md "Fixtures must be sanitised" and "never copy
// real values into fixtures"). An allow-list: only values under keys known to be safe, at the place they are known
// to be safe, survive; every other string becomes a placeholder and every other number 0, under any key and at any
// depth. Real values that are kept in shape are replaced in value: marks get random values of the same form, class
// letters become a Cyrillic "A". Ids become fake uuids made with a random key that lives only as long as the process: the same
// real id gives the same fake id across one probe run, and nobody holding the real ids can match them afterwards.
// Running it twice changes nothing.

/** Fake uuids live in this namespace; anything already in it is left alone. */
export const FAKE_UUID_PREFIX = '00000000-0000-4000-8000-';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** A key of the API's own schema (snake_case or camelCase English); anything else used as a key is data. */
const SCHEMA_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/;

const ENUM = /^[A-Z][A-Z0-9_]{0,39}$/;
/** Looks like a person: initials ("I.O.") or three capitalised words ("Ivanova Maria Petrovna"). */
const PERSON_LIKE = /\p{Lu}\.\s?\p{Lu}\.|(\p{Lu}\p{Ll}+[\s-]+){2}\p{Lu}\p{Ll}+/u;
const MARK_LABELS = /^(н|зач\.|незач\.|освоб\.|осв\.|не осв\.|н\/а)$/;
/** A teaching group as the diary names it: "subgroup 1", "subgroup 2 (boys)", in Russian (api-spec 6.7a) */
const GROUP_NAME = /^\d-я подгруппа( \((девочки|мальчики)\))?$/;
const LEVEL_OF_STUDY = /^(Базовый|Углубленный|Углублённый)$/;
/** A room number as the timetable shows it: "201", "gym", "Lab 2" (in Russian); never something with a person's shape */
const ROOM = /^[\p{L}\d][\p{L}\d .-]{0,15}$/u;
const CLOCK = /^\d{1,2}:\d{2}(:\d{2})?$/;
/** A school year label: "2026-2027" in real responses (second probe), "2026/2027" in the bundle */
const YEAR_LABEL = /^\d{4}\s?[/-]\s?\d{4}$/;

/** Where we are in the response: the key of the value, the key of the container it sits in, the depth. */
export interface Place {
  endpoint: string;
  key: string | null;
  container: string | null;
  /** The key of the container's container (premise_type above as_json) */
  outer?: string | null;
  depth: number;
}

/**
 * The class's and school's lists (6.10.2 to 6.10.4): nothing reads their free text, and a summary or an author may
 * name a person; a timetable slot's summary repeats the subject's name
 */
const SCHOOL_LISTS = /^(planning|premises|timetables?)(-|$)/;
const SCHOOL_LIST_TEXT = new Set(['summary', 'author']);
/** A premise type is the same few words in every school ("classroom", "cl.room", in Russian); one typical value stands for all */
export const PREMISE_TYPE_NAME = 'Кабинет';
export const PREMISE_TYPE_SHORT = 'каб.';

/**
 * The school lists' free text, dropped with everything under it (also by redactRaw): every summary and author; a
 * room's own name (it may be named after a person); the plan's catalogue entry of a subject (6.10.3
 * school_subject.as_json.subject), which repeats the subject's name and is never read
 */
export function dropsSchoolText(endpoint: string, key: string, container: string | null = null): boolean {
  if (!SCHOOL_LISTS.test(endpoint)) return false;
  if (SCHOOL_LIST_TEXT.has(key)) return true;
  if (endpoint.startsWith('premises')) return key === 'audience_name';
  return key === 'subject' && container === 'as_json';
}

/** A value sanitize() replaces with the same value for everyone: its real text never reaches a fixture */
export function fixedValue({ endpoint, key, container, outer }: Place): string | undefined {
  if (!/^premises(-|$)/.test(endpoint) || container !== 'as_json' || outer !== 'premise_type') return undefined;
  if (key === 'name') return PREMISE_TYPE_NAME;
  if (key === 'short_name') return PREMISE_TYPE_SHORT;
  return undefined;
}

/** Does sanitize() keep this string as it is? The probe's leak check treats every other string as sensitive. */
export function keepsString({ endpoint, key, container, outer, depth }: Place, value: string): boolean {
  switch (key) {
    case 'group_name':
      return GROUP_NAME.test(value);
    case 'level_of_study':
      return LEVEL_OF_STUDY.test(value);
    case 'value':
      // level_of_study.value in the teaching plan (6.10.3)
      return container === 'level_of_study' && LEVEL_OF_STUDY.test(value);
    case 'audience_number':
      return ROOM.test(value) && !PERSON_LIKE.test(value);
    case 'short_name':
      // a subject's short name in the plan (school_subject.as_json, 6.10.3); a short name anywhere else may be a person
      return container === 'as_json' && outer === 'school_subject' && value.length <= 20 && !PERSON_LIKE.test(value);
    case 'end_time':
      return CLOCK.test(value);
    case 'partition_type':
    case 'period':
      return ENUM.test(value);
    case 'subject_title':
      return value.length <= 80 && !PERSON_LIKE.test(value);
    case 'name':
      // a subject's name: only directly on the items of the subjects list, never nested deeper
      // a teaching group's name in the plan (6.10.3); a teacher's name is never kept
      if (container === 'study_group') return GROUP_NAME.test(value);
      return (
        /^(subjects|educational_subjects)/.test(endpoint) &&
        depth === 1 &&
        value.length <= 80 &&
        !PERSON_LIKE.test(value)
      );
    case 'start_time':
      // "08:30" in the bundle; seconds allowed, the first probe's values were not plain HH:MM
      return CLOCK.test(value);
    case 'kind':
    case 'type':
    case 'title':
    case 'status':
    case 'person_kind':
    case 'roles':
      return ENUM.test(value);
    case 'label':
      return value === 'А' || YEAR_LABEL.test(value);
    case 'school_year':
      // time_activities[].school_year is the year's label ("2026-2027") when it has that form; otherwise an id
      return YEAR_LABEL.test(value);
    case 'class_number':
      return /^\d{1,2}А$/.test(value);
    case 'summary':
      // a week's "01 September - 06 September", in Russian
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
  // school details (6.10): shifts, grades a bell schedule applies to, weekdays, lessons per week
  'shift',
  'levels',
  'days',
  'class_level',
  'study_hours',
]);

/** Does sanitize() keep this number? A lesson's position only on a lesson slot, never as a school number. */
export function keepsNumber({ key, container }: Place): boolean {
  if (key === 'number') return container === 'slots' || container === 'time_of_bells';
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
  PREMISE_TYPE_NAME,
  PREMISE_TYPE_SHORT,
  ...Object.values(PLACEHOLDER),
]);

const letter = (i: number) => String.fromCharCode(65 + (i % 26));

/**
 * The fictional bells of every fixture: lesson n from 07:05 + 55n for 45 minutes (lesson 1 at 08:00), in the form of
 * the real value (with or without seconds). A time with no lesson number becomes the first lesson's.
 */
function fakeClock(real: string, key: 'start_time' | 'end_time', period: number | null | undefined): string {
  const start = 7 * 60 + 5 + 55 * (period ?? 1);
  const m = key === 'start_time' ? start : start + 45;
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return real.split(':').length === 3 ? `${hhmm}:00` : hhmm;
}

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

  /** Every digit replaced one for one from the same kind of seed, so the length and the form stay: "101S" -> "374A" (Cyrillic letters) */
  const fakeDigits = (real: string, seed: string) => {
    let i = 0;
    return real.replace(/\d/g, () => String(createHash('sha256').update(`${seed}:${i++}`).digest()[0]! % 10));
  };

  function walk(
    value: unknown,
    place: Place,
    ctx: { inStudents: boolean; index: number; seed: string; period?: number | null },
  ): unknown {
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
      // a bell, a timetable slot or a lesson: its times follow its lesson number (see fakeClock)
      const number = (value as { number?: unknown }).number;
      const period = typeof number === 'number' ? number : null;
      for (const [k, v] of Object.entries(value)) {
        if (DROP.has(k) || dropsSchoolText(place.endpoint, k, key)) continue;
        // maps keyed by ids (final/whole: marks[subject][period]); any key that is not a schema word is data
        const outKey = UUID.test(k) || /^\d{3,}$/.test(k) || !SCHEMA_KEY.test(fakeInside(k)) ? fakeId(k) : k;
        out[outKey] = walk(
          v,
          { ...place, key: k, container: key, outer: place.container, depth: place.depth + 1 },
          { ...ctx, seed: `${seed}/${outKey}`, period },
        );
      }
      return out;
    }
    if (typeof value === 'number') return keepsNumber(place) ? value : 0;
    if (typeof value !== 'string') return value;
    if (key === null) return TEXT;
    if (value === '' || value.startsWith(FAKE_UUID_PREFIX)) return value;
    const fixed = fixedValue(place);
    if (fixed !== undefined) return fixed;
    if (TOKENS.has(key)) return 'fixture-token';
    // the school's bells are a fingerprint: every lesson time becomes one fictional scheme with the same lessons
    if ((key === 'start_time' || key === 'end_time') && CLOCK.test(value)) return fakeClock(value, key, ctx.period);
    // a subgroup keeps its number, never who is in it ("(girls)")
    if ((key === 'group_name' || (key === 'name' && place.container === 'study_group')) && GROUP_NAME.test(value))
      return value.replace(/ \(.*\)$/, '');
    if (
      UUID.test(value) ||
      /(^|_)(id|uuid)$/.test(key) ||
      key === 'author' ||
      key === 'school' ||
      (key === 'school_year' && !YEAR_LABEL.test(value))
    )
      return fakeId(value);
    if (key === 'full_name') return ctx.inStudents ? `Ученик ${letter(ctx.index)}` : 'Родитель';
    if (key in PLACEHOLDER) return value.trim() ? PLACEHOLDER[key] : value;
    // a numeric mark keeps its form ("8", "7/9"), never its value
    if (key === 'mark' && /^\d{1,2}(\/\d{1,2})?$/.test(value)) return fakeMark(value, ctx.seed);
    // a room number keeps its form, never its value: a school's whole room list (6.10.4), with its buildings' letters,
    // and the bells could point to the school. A room named in words only ("gym") is the same everywhere
    if (key === 'audience_number' && /\d/.test(value) && keepsString(place, value))
      return fakeDigits(value.replace(/\p{L}+/gu, 'А'), ctx.seed);
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
