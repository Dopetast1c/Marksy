import { describe, expect, it } from 'vitest';
import { defaultFamilyRules, isLowMark } from './family-rules';
import { estimateYear, keepMark, marksNeeded, neededAverage, projectFinal, targetPlan } from './goal';
import {
  activeBands,
  average,
  bandOf,
  boundaryLines,
  distributionBuckets,
  isWorseThan,
  markBand,
  scaleUnit,
  trendTolerance,
} from './scale';
import { by10 } from './scales';

// The by-10 snapshot (docs/providers.md 5.4). Every row of the table "what the scale drives in the UI" is pinned here
// for the Belarusian scale. If a change to the scale model moves any of these, the Belarusian interface would change:
// fix the change, not this test.

const s = by10;
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('by-10 snapshot (docs/providers.md 5.4)', () => {
  it('mark chip colour: band of the worst value', () => {
    expect(Object.fromEntries(range(1, 10).map((v) => [v, markBand(s, [v])]))).toEqual({
      1: 'critical',
      2: 'critical',
      3: 'critical',
      4: 'critical',
      5: 'low',
      6: 'low',
      7: 'good',
      8: 'good',
      9: 'top',
      10: 'top',
    });
    expect(markBand(s, [7, 9])).toBe('good');
    expect(markBand(s, [])).toBeNull();
  });

  it('average and its colour: one decimal, half up', () => {
    expect(average(s, [{ values: [9] }, { values: [8] }, { values: [8] }])).toBe(8.3);
    expect(average(s, [{ values: [7, 9] }, { values: [6] }])).toBe(7.3);
    expect(average(s, [{ values: [7] }, { values: [8] }])).toBe(7.5);
    expect(average(s, [])).toBeNull();
    // the decimals are the scale's; how they are written is the language's (format.test.ts)
    expect(s.averaging.decimals).toBe(1);
    expect([4.5, 6.5, 8.5, 8.9, 9].map((a) => bandOf(s, a))).toEqual(['critical', 'low', 'good', 'good', 'top']);
  });

  it('overview distribution card: one column per band', () => {
    expect(activeBands(s).map((r) => [s.bands[r]!.from, s.bands[r]!.to])).toEqual([
      [1, 4],
      [5, 6],
      [7, 8],
      [9, 10],
    ]);
  });

  it('feed filter chips and the "below" notification rule', () => {
    expect(s.thresholds).toEqual([5, 7]);
    expect(isWorseThan(s, 4, 5)).toBe(true);
    expect(isWorseThan(s, 5, 5)).toBe(false);
    expect(isWorseThan(s, 6, 7)).toBe(true);
  });

  it('trend arrow tolerance is 0.3', () => {
    expect(trendTolerance(s)).toBeCloseTo(0.3, 9);
  });

  it('subject distribution chart: ten bars', () => {
    expect(distributionBuckets(s).map((b) => b.from)).toEqual(range(1, 10));
  });

  it('sparkline reference lines at 5 and 9', () => {
    expect(boundaryLines(s)).toEqual([5, 9]);
  });

  it('quarter goal picker', () => {
    expect(s.goalTargets).toEqual([7, 8, 9]);
  });

  it('projected final: rounded average, 7.5 gives 8', () => {
    expect([7.4, 7.5, 7.6, 9.5, 1.2, null].map((a) => projectFinal(s, a))).toEqual([7, 8, 8, 10, 1, null]);
  });

  it('marks needed: "ещё 2 × 9 или 1 × 10"', () => {
    expect(neededAverage(s, 8)).toBe(7.5);
    // four marks averaging 7.0, goal 8
    expect(targetPlan(s, 28, 4, 7.5)).toEqual([
      { value: 10, count: 1 },
      { value: 9, count: 2 },
      { value: 8, count: 4 },
    ]);
    expect(marksNeeded(s, 28, 4, 8)).toEqual({
      target: 8,
      projected: 7,
      need: 7.5,
      reached: false,
      plan: [
        { value: 10, count: 1 },
        { value: 9, count: 2 },
        { value: 8, count: 4 },
      ],
      keep: null,
    });
  });

  it('keep mark: the worst next mark that keeps the goal', () => {
    // 8, 8, 7 = 7.67; to stay at 7.5 the next mark must be at least 7
    expect(keepMark(s, 7.5, 23, 3)).toBe(7);
    expect(marksNeeded(s, 23, 3, 8)).toMatchObject({ reached: true, keep: 7, plan: [] });
  });

  it('guidance thresholds: a low mark is 4 and below, a work-type gap is 1.0', () => {
    const rules = defaultFamilyRules(s);
    expect(range(1, 10).filter((v) => isLowMark(s, v, rules))).toEqual([1, 2, 3, 4]);
    expect(scaleUnit(s)).toBe(1);
    expect(rules.dropStep).toBeCloseTo(0.3, 9);
  });

  it('year estimate: mean of the term finals posted so far', () => {
    expect(estimateYear(s, [8, 9], [{ values: [3] }])).toBe(8.5);
    expect(estimateYear(s, [], [])).toBeNull();
  });
});
