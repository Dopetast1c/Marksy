import { PERSONAL_FIELDS } from './schemas';

// What the collector keeps of a response (raw_responses, docs/design.md 10.4): the body as it came, minus the personal
// fields Marksy never maps (docs/api-spec.md 6.1, "never stored, never logged"). Ids stay, so a body can be parsed
// again after a drift fix. This is not sanitize(): fixtures replace ids and texts, stored bodies must still work.

const NEVER_STORED = new Set<string>([...PERSONAL_FIELDS, 'email', 'phone', 'phone_number', 'birthday', 'address']);

function walk(value: unknown, inChild: boolean): unknown {
  if (Array.isArray(value)) return value.map((v) => walk(v, inChild));
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    // a child's profile_id is the id in every diary URL; the top-level one is the parent's, never stored
    if (NEVER_STORED.has(k) && !(inChild && k === 'profile_id')) continue;
    out[k] = k === 'students_for_parent' && Array.isArray(v) ? v.map((c) => walk(c, true)) : walk(v, false);
  }
  return out;
}

export function redactRaw(raw: unknown): unknown {
  return walk(raw, false);
}
