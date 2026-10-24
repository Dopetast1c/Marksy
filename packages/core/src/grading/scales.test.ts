import { describe, expect, it } from 'vitest';
import { calendar } from '../model/schemas';
import { sampleManifest } from '../testing/samples';
import { formatAverage, formatBandRange, formatValue } from './format';
import { defaultGoal, estimateYear, keepMark, marksNeeded, neededAverage, projectFinal, targetPlan } from './goal';
import { getScale, studentYearScale, yearHasMarks } from './resolve';
import {
  activeBands,
  average,
  bandOf,
  boundaryLines,
  compare,
  distributionBuckets,
  isWorseThan,
  toQuality,
} from './scale';
import { BUILT_IN_SCALES, de16, pct100, ru5, ua12 } from './scales';
import { gradingScale } from './types';

describe('built-in scales', () => {
  it('all validate and pin their band tables', () => {
    for (const s of Object.values(BUILT_IN_SCALES)) expect(gradingScale.parse(s)).toEqual(s);
    const table = (id: string) => activeBands(getScale(id)).map((r) => formatBandRange(getScale(id), r, 'en'));
    expect(table('ru-5')).toEqual(['1–2', '3', '4', '5']);
    expect(table('ua-12')).toEqual(['1–3', '4–6', '7–9', '10–12']);
    expect(table('de-1-6')).toEqual(['5–6', '4', '2–3', '1']);
    expect(table('pct-100')).toEqual(['0%–49%', '50%–64%', '65%–84%', '85%–100%']);
  });

  it('sample averages', () => {
    expect(average(ru5, [{ values: [5, 4, 4] }])).toBe(4.33);
    expect(average(ua12, [{ values: [10, 11] }])).toBe(10.5);
    expect(average(pct100, [{ values: [87, 90, 72] }])).toBe(83);
  });
});

describe('de-1-6: lower is better', () => {
  const s = de16;
  it('compares and filters in the right direction', () => {
    expect(compare(s, 1, 2)).toBe(1);
    expect(isWorseThan(s, 5, 4)).toBe(true);
    expect(isWorseThan(s, 3, 4)).toBe(false);
    expect(toQuality(s, 1)).toBe(1);
    expect(toQuality(s, 6)).toBe(0);
  });

  it('bands averages by the edge reached', () => {
    expect([1, 1.5, 2, 3.5, 4, 4.5, 6].map((v) => bandOf(s, v))).toEqual([
      'top',
      'good',
      'good',
      'low',
      'low',
      'critical',
      'critical',
    ]);
    expect(boundaryLines(s)).toEqual([4, 1]);
  });

  it('rounds half toward the better mark and plans with lower values', () => {
    expect(projectFinal(s, 2.5)).toBe(2);
    expect(projectFinal(s, 2.6)).toBe(3);
    expect(neededAverage(s, 2)).toBe(2.5);
    // three marks of 3 (sum 9), goal 2: need 2.5
    expect(targetPlan(s, 9, 3, 2.5)).toEqual([
      { value: 1, count: 1 },
      { value: 2, count: 3 },
    ]);
    expect(keepMark(s, 2.5, 4, 2)).toBe(3);
  });
});

describe('final rules', () => {
  it('half-even, floor and ceil', () => {
    const even = { ...ru5, finalRule: 'round-half-even' as const };
    expect([3.5, 4.5, 4.51].map((a) => projectFinal(even, a))).toEqual([4, 4, 5]);
    const floor = { ...ru5, finalRule: 'floor' as const };
    expect(projectFinal(floor, 4.99)).toBe(4);
    expect(neededAverage(floor, 4)).toBe(4);
    const ceil = { ...ru5, finalRule: 'ceil' as const };
    expect(projectFinal(ceil, 3.01)).toBe(4);
    expect(neededAverage(ceil, 4)).toBe(3.01);
  });

  it('rules that cannot be inverted give null and hide the goal', () => {
    expect(projectFinal(pct100, 80)).toBeNull();
    expect(neededAverage(pct100, 85)).toBeNull();
    expect(marksNeeded(pct100, 160, 2, 85)).toBeNull();
    expect(estimateYear(pct100, [], [{ values: [80, 90] }])).toBe(85);
    expect(estimateYear(ua12, [9], [])).toBeNull();
  });

  it('a new subject starts with the scale’s middle goal', () => {
    expect(defaultGoal(getScale('by-10'))).toBe(8);
    expect(defaultGoal(ru5)).toBe(5);
    expect(defaultGoal(de16)).toBe(2);
    expect(defaultGoal({ ...ru5, goalTargets: [] })).toBeNull();
  });
});

describe('format', () => {
  it('formats values per scale and locale', () => {
    expect(formatValue(pct100, 87, 'en')).toBe('87%');
    expect(formatValue({ ...ru5, step: 0.5 }, 4.5, 'ru')).toBe('4,5');
    const letters = { ...ru5, letters: [{ label: 'A', value: 5 }] };
    expect(formatValue(letters, 5, 'en')).toBe('A');
    expect(formatAverage(ru5, 4.333, 'en')).toBe('4.33');
  });

  it('buckets percent marks by tens', () => {
    expect(distributionBuckets(pct100)).toHaveLength(10);
    expect(distributionBuckets(pct100).at(-1)).toEqual({ from: 90, to: 100 });
  });
});

describe('student year scale', () => {
  const year = { schoolYear: { externalId: 'y', label: '2026/27', start: '2026-09-01', end: '2027-05-31' }, terms: [] };

  it('uses the manifest default when the provider says nothing', () => {
    expect(studentYearScale(sampleManifest, calendar.parse(year))?.id).toBe('by-10');
  });

  it('uses the year override', () => {
    expect(studentYearScale(sampleManifest, { gradingScaleId: 'pct-100' })?.id).toBe('pct-100');
  });

  it('has no scale in a year without marks, whatever the grade', () => {
    const scale = studentYearScale(sampleManifest, calendar.parse({ ...year, gradingScaleId: null }));
    expect(scale).toBeNull();
    expect(yearHasMarks(scale)).toBe(false);
  });

  it('refuses an unknown scale id', () => {
    expect(() => getScale('xx-7')).toThrow(/Unknown/);
  });
});
