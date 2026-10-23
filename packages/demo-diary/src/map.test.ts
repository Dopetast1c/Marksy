import { createMemoryDrift, driftChecker } from '@marksy/core';
import { describe, expect, it } from 'vitest';
import { mapLesson } from './map';
import type { LessonRaw } from './api';

const lesson = (over: Partial<LessonRaw> = {}): LessonRaw => ({
  uid: 'L-1',
  n: 2,
  starts: '09:25',
  subject: { code: 'alg', title: 'Алгебра' },
  topic: null,
  homework: null,
  kind: null,
  marks: [],
  ...over,
});

describe('demo-full mapping', () => {
  it('builds a slot id while the diary has none', () => {
    const drift = createMemoryDrift();
    const l = mapLesson('2025-09-09', lesson({ uid: null }), driftChecker(drift, 'diary'));
    expect(l.externalId).toBe('slot:2025-09-09:2:alg');
  });

  it('turns an absence in the mark cell into attendance, never a mark', () => {
    const drift = createMemoryDrift();
    const l = mapLesson(
      '2025-09-09',
      lesson({ marks: [{ uid: 'M-9', value: 'н', type: null, note: null }] }),
      driftChecker(drift, 'diary'),
    );
    expect(l.marks).toEqual([]);
    expect(l.attendance).toEqual([
      expect.objectContaining({ status: 'absent', externalId: 'att:M-9', lessonExternalId: 'L-1' }),
    ]);
  });

  it('reports a new work type as drift and keeps the mark', () => {
    const drift = createMemoryDrift();
    const l = mapLesson(
      '2025-09-09',
      lesson({ marks: [{ uid: 'M-9', value: '7', type: 'POSTER', note: null }] }),
      driftChecker(drift, 'diary'),
    );
    expect(l.marks[0]).toMatchObject({ workType: 'other', workTypeRaw: 'POSTER', values: [7] });
    expect(drift.events).toEqual([expect.objectContaining({ kind: 'new_enum_value', sample: 'POSTER' })]);
  });
});
