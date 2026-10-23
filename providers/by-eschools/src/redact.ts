import { dropsSchoolText } from './sanitize';
import { PERSONAL_FIELDS } from './schemas';

// What the collector keeps of a response (raw_responses, docs/design.md 10.4): the body as it came, minus the personal
// fields Marksy never maps (docs/api-spec.md 6.1, "never stored, never logged"). Ids stay, so a body can be parsed
// again after a drift fix. This is not sanitize(): fixtures replace ids and texts, stored bodies must still work.

// teacher: 6.7a and 6.10.3 name the teacher of every group; only the student's own is kept, in the subject row
const NEVER_STORED = new Set<string>([
  ...PERSONAL_FIELDS,
  'teacher',
  'email',
  'phone',
  'phone_number',
  'birthday',
  'address',
]);
/** The school's room list (6.10.4): only what the mapper reads of a room, never its free-text name or type */
const PREMISE_KEPT = new Set(['uuid', 'audience_number']);

function walk(endpoint: string, value: unknown, inChild: boolean, key: string | null = null): unknown {
  if (Array.isArray(value)) return value.map((v) => walk(endpoint, v, inChild, key));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    // a child's profile_id is the id in every diary URL; the top-level one is the parent's, never stored
    if (NEVER_STORED.has(k) && !(inChild && k === 'profile_id')) continue;
    // the teaching plan's and room list's free text (6.10.3, 6.10.4) may name a person
    if (dropsSchoolText(endpoint, k, key)) continue;
    out[k] =
      k === 'students_for_parent' && Array.isArray(v)
        ? v.map((c) => walk(endpoint, c, true))
        : walk(endpoint, v, false, k);
  }
  return out;
}

export function redactRaw(endpoint: string, raw: unknown): unknown {
  if (endpoint === 'premises' && Array.isArray(raw)) {
    return raw.map((p) =>
      p && typeof p === 'object' ? Object.fromEntries(Object.entries(p).filter(([k]) => PREMISE_KEPT.has(k))) : p,
    );
  }
  return walk(endpoint, raw, false);
}
