import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ProviderSchemaError } from '../providers/errors';
import { createMemoryDrift } from '../http/run-context';
import { driftChecker } from './check';

const slot = z.looseObject({
  entry_id: z.string(),
  topic: z.string().nullable(),
  grade: z.looseObject({ mark: z.string(), kind: z.string() }).nullable(),
});
const day = z.looseObject({ date: z.number(), slots: z.array(slot) });

function setup() {
  const drift = createMemoryDrift();
  return { drift, check: driftChecker(drift, 'entries') };
}

describe('drift checker', () => {
  it('reports unknown fields at their path and keeps the data', () => {
    const { drift, check } = setup();
    const days = check.items(
      day,
      [{ date: 1, slots: [{ entry_id: 'a', topic: null, grade: null, new_flag: true }], extra: 1 }],
      'days',
    );
    expect(days).toHaveLength(1);
    expect(drift.events).toEqual([
      { kind: 'unknown_field', endpoint: 'entries', path: 'days[].slots[].new_flag' },
      { kind: 'unknown_field', endpoint: 'entries', path: 'days[].extra' },
    ]);
  });

  it('reports a missing field and a type change, and skips only the broken item', () => {
    const { drift, check } = setup();
    const days = check.items(day, [{ date: 1, slots: [] }, { slots: [] }, { date: 'x', slots: [] }], 'days');
    expect(days).toHaveLength(1);
    expect(drift.events).toEqual([
      { kind: 'missing_field', endpoint: 'entries', path: 'days[].date' },
      { kind: 'type_mismatch', endpoint: 'entries', path: 'days[].date', sample: 'string' },
    ]);
  });

  it('records a new enum value without failing', () => {
    const { drift, check } = setup();
    expect(check.known('ALPHA', ['ALPHA', 'BETA'], 'grade.kind')).toBe(true);
    expect(check.known(null, ['ALPHA'], 'grade.kind')).toBe(true);
    expect(check.known('GAMMA', ['ALPHA', 'BETA'], 'grade.kind')).toBe(false);
    expect(drift.events).toEqual([
      { kind: 'new_enum_value', endpoint: 'entries', path: 'grade.kind', sample: 'GAMMA' },
    ]);
  });

  it('walks records and nullable objects', () => {
    const { drift, check } = setup();
    const finals = z.looseObject({
      marks: z.record(z.string(), z.record(z.string(), z.looseObject({ mark: z.string() }))),
    });
    check.shape(finals, { marks: { s1: { q1: { mark: '8', why: 'x' } } } });
    expect(drift.events.map((e) => e.path)).toEqual(['marks.*.*.why']);
  });

  it('throws only when a whole response cannot be used', () => {
    const { drift, check } = setup();
    const me = z.looseObject({ user_id: z.string(), students: z.array(z.looseObject({ id: z.string() })) });
    expect(check.parse(me, { user_id: 'u', students: [], more: 1 }).user_id).toBe('u');
    expect(() => check.parse(me, { students: [] })).toThrow(ProviderSchemaError);
    expect(drift.events.map((e) => e.kind)).toEqual(['unknown_field', 'missing_field']);
  });
});
