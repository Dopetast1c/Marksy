import { describe, expect, it } from 'vitest';
import lessons from '../fixtures/unsanitised/lessons.json';
import me from '../fixtures/unsanitised/me.json';
import { redactRaw } from './redact';
import { meResponse, PERSONAL_FIELDS } from './schemas';

const keys = (v: unknown, out = new Set<string>()): Set<string> => {
  if (Array.isArray(v)) v.forEach((x) => keys(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) keys(x, out.add(k));
  return out;
};

describe('redactRaw: what raw_responses keeps', () => {
  it('drops the fields that are never stored, keeps the ids the mapper needs', () => {
    const r = redactRaw(me) as typeof me;
    for (const f of [...PERSONAL_FIELDS.filter((f) => f !== 'profile_id'), 'email'])
      expect(keys(r).has(f), f).toBe(false);
    expect('profile_id' in r).toBe(false);
    expect(r.students_for_parent.map((s) => s.profile_id)).toEqual(me.students_for_parent.map((s) => s.profile_id));
    expect(meResponse.safeParse(r).success).toBe(true);
  });

  it('drops the teacher on every mark', () => {
    expect(keys(redactRaw(lessons)).has('author')).toBe(false);
  });
});
