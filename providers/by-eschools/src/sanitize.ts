// sanitize() for e-schools.by responses (docs/providers.md 8, CLAUDE.md "Fixtures must be sanitised"). It works on any
// response by key name, so the probe can run it on every endpoint without a table: ids become stable fake uuids (the
// same real id gives the same fake id in every file), names and free text become fixed placeholders, tokens are
// replaced, contact fields are dropped. Running it twice changes nothing.

/** Fake uuids live in this namespace; anything already in it is left alone. */
export const FAKE_UUID_PREFIX = '00000000-0000-4000-8000-';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** FNV-1a, 32 bits, with a seed: enough to keep ids apart in a fixture set, and not reversible to the real id. */
function fnv(text: string, seed: number): number {
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function fakeUuid(real: string): string {
  if (real.startsWith(FAKE_UUID_PREFIX)) return real;
  const hex = (fnv(real, 0).toString(16).padStart(8, '0') + fnv(real, 0x9e37).toString(16).padStart(8, '0')).slice(
    0,
    12,
  );
  return FAKE_UUID_PREFIX + hex;
}

/** Keys whose string value is an id of a person, a school, a lesson or a mark. */
const ID_KEYS = new Set([
  'user_id',
  'profile_id',
  'school_id',
  'our_school_id',
  'school',
  'uuid',
  'lesson_uuid',
  'lesson_template_id',
  'subject_id',
  'teacher_id',
  'author',
  'time_activity_id',
  'homework_source_id',
  'school_year',
  'week_activity_uuid',
]);
/** Free text a teacher or the school wrote: replaced whole when not empty. */
const TEXT: Record<string, string> = {
  topic: 'Тема урока',
  homework: 'Домашнее задание',
  message: 'Сообщение',
  comment: 'Комментарий',
  school_name: 'Школа',
  position: 'Должность',
};
const TOKENS = new Set(['auth_token', 'refresh_token', 'authToken', 'refreshToken']);
/** Dropped entirely: nothing in the app needs them. */
const DROP = new Set(['email', 'phone', 'phone_number', 'mobile', 'birthday', 'birth_date', 'address', 'parent_code']);
const NAME_PARTS = new Set(['first_name', 'second_name', 'last_name', 'middle_name', 'fio']);

const letter = (i: number) => String.fromCharCode(65 + (i % 26));

function walk(value: unknown, key: string | null, ctx: { inStudents: boolean; index: number }): unknown {
  if (Array.isArray(value)) {
    return value.map((v, i) => walk(v, key, { inStudents: ctx.inStudents || key === 'students_for_parent', index: i }));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (DROP.has(k)) continue;
      // maps keyed by ids (final/whole: marks[subject][period]) get fake keys too
      const outKey = UUID.test(k) ? fakeUuid(k) : k;
      out[outKey] = walk(v, k, ctx);
    }
    return out;
  }
  if (typeof value !== 'string' || key === null) return value;
  if (TOKENS.has(key)) return 'fixture-token';
  if (ID_KEYS.has(key) || UUID.test(value)) return value ? fakeUuid(value) : value;
  if (key === 'full_name') return ctx.inStudents ? `Ученик ${letter(ctx.index)}` : 'Родитель';
  if (NAME_PARTS.has(key)) return value ? 'Имя' : value;
  if (key in TEXT) return value.trim() ? TEXT[key] : value;
  return value;
}

/** Replace names, ids and free text in one raw response. The endpoint does not matter: rules go by key. */
export function sanitize(_endpoint: string, raw: unknown): unknown {
  return walk(raw, null, { inStudents: false, index: 0 });
}
