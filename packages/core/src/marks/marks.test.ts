import { describe, expect, it } from 'vitest';
import { by10, de16 } from '../grading/scales';
import type { Term } from '../model/schemas';
import { addDays, daysBetween, weekStartOf, weekdayOf } from './dates';
import { availableKinds, listInstances, periodInstance, previousInstance, trendBuckets } from './periods';
import type { PeriodContext } from './periods';
import { compareSubjects, comparePeriods, movers, periodStats, sortSubjects, trendOf } from './stats';
import type { MarkFact } from './stats';

const term = (index: number, start: string, end: string): Term => ({
  externalId: `t${index}`,
  kind: 'quarter',
  index,
  label: String(index),
  start,
  end,
});
const terms = [
  term(1, '2026-09-01', '2026-10-31'),
  term(2, '2026-11-09', '2026-12-24'),
  term(3, '2027-01-11', '2027-03-20'),
  term(4, '2027-03-30', '2027-05-31'),
];
// Wednesday in the first term
const ctx: PeriodContext = {
  today: '2026-10-14',
  weekStart: 1,
  schoolYear: { from: '2026-09-01', to: '2027-05-31' },
  terms,
  pastYears: [{ from: '2025-09-01', to: '2026-05-31' }],
};

const mk = (date: string, subjectId: string, ...values: number[]): MarkFact => ({ date, subjectId, values });

describe('dates', () => {
  it('does calendar arithmetic without time zones', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-10-14', '2026-10-20')).toBe(6);
    expect(weekdayOf('2026-10-14')).toBe(3);
    expect(weekStartOf('2026-10-14', 1)).toBe('2026-10-12');
    expect(weekStartOf('2026-10-14', 0)).toBe('2026-10-11');
    expect(weekStartOf('2026-10-11', 1)).toBe('2026-10-05');
  });
});

describe('periods', () => {
  it('current week: to today for marks, to the week end for lessons', () => {
    expect(periodInstance(ctx, 'week', 0)).toMatchObject({ from: '2026-10-12', to: '2026-10-14', end: '2026-10-18' });
    expect(periodInstance(ctx, 'week', 0, 'lessons')).toMatchObject({ to: '2026-10-18' });
    expect(periodInstance(ctx, 'week', 1)).toMatchObject({ from: '2026-10-05', to: '2026-10-11' });
  });

  it('weeks start on the manifest weekday', () => {
    expect(periodInstance({ ...ctx, weekStart: 0 }, 'week', 0)).toMatchObject({ from: '2026-10-11', to: '2026-10-14' });
  });

  it('nothing before the school year', () => {
    expect(periodInstance(ctx, 'week', 6)).toMatchObject({ from: '2026-08-31' });
    expect(periodInstance(ctx, 'week', 7)).toBeNull();
    expect(listInstances(ctx, 'week')).toHaveLength(7);
    expect(periodInstance(ctx, 'month', 1)).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodInstance(ctx, 'month', 2)).toBeNull();
    expect(periodInstance(ctx, 'week', -1)).toBeNull();
  });

  it('terms: the first has no previous; holidays belong to the last started term', () => {
    const q1 = periodInstance(ctx, 'term', 0)!;
    expect(q1).toMatchObject({ from: '2026-09-01', to: '2026-10-14', end: '2026-10-31' });
    expect(previousInstance(ctx, q1)).toBeNull();
    const holidays = { ...ctx, today: '2026-11-03' };
    expect(periodInstance(holidays, 'term', 0)?.term?.index).toBe(1);
    expect(periodInstance({ ...ctx, today: '2026-11-10' }, 'term', 1)?.term?.index).toBe(1);
  });

  it('years: the current one to today, earlier ones from what Marksy has', () => {
    expect(periodInstance(ctx, 'year', 0)).toMatchObject({ from: '2026-09-01', to: '2026-10-14' });
    expect(periodInstance(ctx, 'year', 1)).toMatchObject({ from: '2025-09-01', to: '2026-05-31' });
    expect(periodInstance(ctx, 'year', 2)).toBeNull();
  });

  it('the term kind exists only with terms', () => {
    expect(availableKinds(ctx)).toEqual(['week', 'month', 'term', 'year']);
    expect(availableKinds({ terms: [] })).toEqual(['week', 'month', 'year']);
    expect(periodInstance({ ...ctx, terms: [] }, 'term', 0)).toBeNull();
  });

  it('trend buckets', () => {
    const weeks = trendBuckets(ctx, periodInstance(ctx, 'week', 0)!);
    expect(weeks).toHaveLength(7);
    expect(weeks[0]?.from).toBe('2026-08-31');
    expect(weeks.at(-1)).toMatchObject({ from: '2026-10-12', to: '2026-10-14', selected: true, future: false });
    expect(trendBuckets(ctx, periodInstance(ctx, 'month', 0)!).map((b) => b.from)).toEqual([
      '2026-09-01',
      '2026-10-01',
    ]);
    const quarters = trendBuckets(ctx, periodInstance(ctx, 'term', 0)!);
    expect(quarters.map((b) => b.future)).toEqual([false, true, true, true]);
    expect(trendBuckets(ctx, periodInstance(ctx, 'year', 0)!)).toHaveLength(9);
  });
});

describe('comparison: the four missing-data cases (design 6.1)', () => {
  const marks = [
    mk('2026-10-06', 'a', 8, 9),
    mk('2026-10-07', 'a', 8),
    mk('2026-10-12', 'a', 7),
    mk('2026-10-13', 'b', 7),
  ];
  const week = (o: number) => periodInstance(ctx, 'week', o)!;

  it('both have marks: value, arrow and delta', () => {
    const c = comparePeriods(by10, periodStats(by10, marks, week(0)), periodStats(by10, marks, week(1)));
    expect(c).toEqual({
      current: 'marks',
      previous: 'marks',
      average: 7,
      prevAverage: 8.3,
      delta: -1.3,
      trend: 'down',
    });
  });

  it('previous exists without marks: no arrow', () => {
    const c = comparePeriods(by10, periodStats(by10, marks, week(0)), periodStats(by10, marks, week(2)));
    expect(c).toMatchObject({ current: 'marks', previous: 'empty', trend: null, delta: null });
  });

  it('previous does not exist: no arrow', () => {
    const c = comparePeriods(by10, periodStats(by10, marks, periodInstance(ctx, 'term', 0)!), null);
    expect(c).toMatchObject({ current: 'marks', previous: 'none', trend: null });
  });

  it('no marks now: a dash, never a zero, and no drop', () => {
    const monday = { ...ctx, today: '2026-10-19' };
    const cur = periodStats(by10, marks, periodInstance(monday, 'week', 0)!);
    const c = comparePeriods(by10, cur, periodStats(by10, marks, week(0)));
    expect(c).toMatchObject({ current: 'empty', previous: 'marks', average: null, prevAverage: 7, trend: null });
    expect(comparePeriods(by10, cur, cur)).toMatchObject({ current: 'empty', previous: 'empty', average: null });
  });

  it('counts band columns', () => {
    expect(periodStats(by10, [mk('2026-10-12', 'a', 3, 9), mk('2026-10-12', 'a')]).bands).toEqual({
      critical: 1,
      low: 0,
      good: 0,
      top: 1,
    });
  });
});

describe('trend, movers and sorting', () => {
  it('needs 0.3 for an arrow, direction-aware', () => {
    expect(trendOf(by10, 8, 7.7)).toBe('up');
    expect(trendOf(by10, 8, 7.8)).toBe('flat');
    expect(trendOf(by10, 7.7, 8)).toBe('down');
    expect(trendOf(de16, 2, 2.5)).toBe('up');
    expect(trendOf(by10, 8, null)).toBeNull();
  });

  const marks = [
    mk('2026-10-06', 'alg', 9),
    mk('2026-10-12', 'alg', 6),
    mk('2026-10-13', 'alg', 6),
    mk('2026-10-06', 'bio', 7),
    mk('2026-10-12', 'bio', 8),
    mk('2026-10-06', 'geo', 8),
    mk('2026-10-12', 'geo', 8.2),
    mk('2026-10-06', 'art', 5),
    mk('2026-10-13', 'art', 9),
  ];
  const rows = compareSubjects(
    by10,
    marks,
    ['alg', 'bio', 'geo', 'art', 'his'],
    periodInstance(ctx, 'week', 0)!,
    periodInstance(ctx, 'week', 1)!,
  );

  it('movers: every subject with a trend, largest change first', () => {
    expect(movers(rows).map((r) => [r.subjectId, r.trend, r.delta])).toEqual([
      ['art', 'up', 4],
      ['alg', 'down', -3],
      ['bio', 'up', 1],
    ]);
  });

  it('every subject is listed; subjects without marks sort last', () => {
    expect(rows).toHaveLength(5);
    expect(sortSubjects(by10, rows, 'weak').map((r) => r.subjectId)).toEqual(['alg', 'bio', 'geo', 'art', 'his']);
    expect(sortSubjects(by10, rows, 'strong').map((r) => r.subjectId)).toEqual(['art', 'geo', 'bio', 'alg', 'his']);
    expect(sortSubjects(by10, rows, 'fell').map((r) => r.subjectId)).toEqual(['alg', 'geo', 'bio', 'art', 'his']);
    expect(sortSubjects(by10, rows, 'rose').map((r) => r.subjectId)).toEqual(['art', 'bio', 'geo', 'alg', 'his']);
  });
});
