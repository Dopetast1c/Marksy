import { getScale } from '@marksy/core';
import { describe, expect, it } from 'vitest';
import { defaultRules } from './rules';

const byKey = (rules: ReturnType<typeof defaultRules>) => Object.fromEntries(rules.map((r) => [r.presetKey, r]));

describe('default notification rules (design.md 11)', () => {
  const scale = getScale('by-10');

  it("a teacher's comment: parents on in the evening, students off; only where the diary has them", () => {
    expect(byKey(defaultRules('parent', scale, { behaviour: true })).comment).toMatchObject({
      event: 'comment',
      when: 'evening',
      enabled: true,
    });
    expect(byKey(defaultRules('student', scale, { behaviour: true })).comment).toMatchObject({ enabled: false });
    expect(byKey(defaultRules('admin', scale, { behaviour: false })).comment).toBeUndefined();
  });

  it("on the child's scale: the first threshold, the top band, half a by-10 point for an average", () => {
    const rules = byKey(defaultRules('parent', scale, { behaviour: false }));
    expect(rules['mark.low']!.condition).toEqual({ dir: 'worse', value: scale.thresholds[0] });
    expect(rules['mark.top']).toMatchObject({ when: 'evening', enabled: true });
    expect(rules['average.drop']).toMatchObject({
      enabled: false,
      condition: { step: 0.5, period: 'week', minMarks: 2 },
    });
    const ru5 = byKey(defaultRules('parent', getScale('ru-5'), { behaviour: false }));
    expect((ru5['average.drop']!.condition as { step: number }).step).toBeLessThan(0.5);
  });

  it('a year without marks: no mark or average rules, and the homework digest on for parents', () => {
    const rules = byKey(defaultRules('parent', null, { behaviour: true }));
    expect(Object.keys(rules).filter((k) => k.startsWith('mark') || k.startsWith('average'))).toEqual([]);
    expect(rules.homework).toMatchObject({ enabled: true });
    expect(byKey(defaultRules('parent', scale, { behaviour: true })).homework).toMatchObject({ enabled: false });
  });

  it('students get any new mark and the homework digest; parents the weekly summary', () => {
    const student = byKey(defaultRules('student', scale, { behaviour: false }));
    expect(student['mark.any']!.enabled).toBe(true);
    expect(student.homework!.enabled).toBe(true);
    expect(student.summary!.enabled).toBe(false);
    expect(byKey(defaultRules('parent', scale, { behaviour: false })).summary!.enabled).toBe(true);
  });
});
