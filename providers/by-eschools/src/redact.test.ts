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
    const r = redactRaw('me', me) as typeof me;
    for (const f of [...PERSONAL_FIELDS.filter((f) => f !== 'profile_id'), 'email'])
      expect(keys(r).has(f), f).toBe(false);
    expect('profile_id' in r).toBe(false);
    expect(r.students_for_parent.map((s) => s.profile_id)).toEqual(me.students_for_parent.map((s) => s.profile_id));
    expect(meResponse.safeParse(r).success).toBe(true);
  });

  it('drops the teacher on every mark', () => {
    expect(keys(redactRaw('lessons', lessons)).has('author')).toBe(false);
  });

  it("drops the school lists' free text: summaries and authors in the plan, everything but the number of a room", () => {
    const planning = [
      {
        uuid: 'subject-1',
        summary: 'Иванова Мария Петровна',
        author: 'author-1',
        school_subject: {
          uuid: 'ss-1',
          summary: 'Математика',
          as_json: { short_name: 'Матем.', summary: 'Иванова Мария Петровна', author: 'author-1' },
        },
        templates: [{ uuid: 't-1', study_group: { uuid: 'g-1', name: '1-я подгруппа', summary: 'Иванова М.П.' } }],
      },
    ];
    const r = redactRaw('planning', planning);
    expect(keys(r).has('summary')).toBe(false);
    expect(keys(r).has('author')).toBe(false);
    expect(JSON.stringify(r)).toContain('Матем.');
    expect(JSON.stringify(r)).toContain('t-1');
    const premises = [
      {
        uuid: 'room-1',
        audience_number: '210',
        audience_name: 'Кабинет Ивановой М.П.',
        summary: 'Иванова',
        author: 'author-1',
        premise_type: { as_json: { name: 'Спортзал' } },
      },
    ];
    expect(redactRaw('premises', premises)).toEqual([{ uuid: 'room-1', audience_number: '210' }]);
  });
});
