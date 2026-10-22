import { average, bandOf, compare, sumCount, trendTolerance } from '../grading/scale';
import type { Weighted } from '../grading/scale';
import { roundHalfUp } from '../grading/round';
import type { BandRole, GradingScale } from '../grading/types';
import type { DateRange, ISODate } from '../model/schemas';
import { inRange } from './dates';

// Period statistics and the comparison model (docs/design.md 6.1). Missing data is a state, never a zero: an average
// over no marks is null, and an arrow needs two real averages.

/** The minimum a stored mark needs for the maths. Non-numeric marks have values []; absences are not marks at all. */
export interface MarkFact extends Weighted {
  date: ISODate;
  subjectId: string;
}

export interface PeriodStats {
  average: number | null;
  /** Numeric values counted (a double mark counts twice) */
  count: number;
  sum: number;
  /** Values per band role; empty bands stay 0 */
  bands: Record<BandRole, number>;
}

export function periodStats(scale: GradingScale, marks: readonly MarkFact[], range?: DateRange): PeriodStats {
  const inP = range ? marks.filter((m) => inRange(m.date, range)) : marks;
  const bands: Record<BandRole, number> = { critical: 0, low: 0, good: 0, top: 0 };
  for (const m of inP) {
    for (const v of m.values) {
      const b = bandOf(scale, v);
      if (b) bands[b]++;
    }
  }
  return { average: average(scale, inP), ...sumCount(inP), bands };
}

export type Trend = 'up' | 'down' | 'flat';

/** up = better, whatever the scale's direction; null without two averages. */
export function trendOf(scale: GradingScale, current: number | null, previous: number | null): Trend | null {
  if (current == null || previous == null) return null;
  const d = (current - previous) * (scale.higherIsBetter ? 1 : -1);
  const tol = trendTolerance(scale) - 1e-9;
  return d >= tol ? 'up' : d <= -tol ? 'down' : 'flat';
}

export interface Comparison {
  /** Does the selected instance have marks */
  current: 'marks' | 'empty';
  /** Does the previous instance have marks, or does it not exist at all (decided from the calendar) */
  previous: 'marks' | 'empty' | 'none';
  average: number | null;
  prevAverage: number | null;
  /** current - previous, rounded to the scale's decimals; null unless both have marks */
  delta: number | null;
  trend: Trend | null;
}

/**
 * The comparison of one instance with the one before it. `previous` is null when that instance does not exist (first
 * term, first week of the school year). The cases of design 6.1 follow from `current` and `previous`; the UI picks
 * the copy ("было 8.4", "прошлая неделя: оценок не было", "сравнить не с чем", "пока нет оценок").
 */
export function comparePeriods(scale: GradingScale, current: PeriodStats, previous: PeriodStats | null): Comparison {
  const cur = current.average;
  const prev = previous?.average ?? null;
  return {
    current: current.count ? 'marks' : 'empty',
    previous: previous === null ? 'none' : previous.count ? 'marks' : 'empty',
    average: cur,
    prevAverage: prev,
    delta: cur != null && prev != null ? roundHalfUp(cur - prev, scale.averaging.decimals) : null,
    trend: trendOf(scale, cur, prev),
  };
}

export interface SubjectComparison extends Comparison {
  subjectId: string;
  count: number;
}

/** Per-subject comparison of two instances, for every subject in `subjectIds` (the list is the curriculum). */
export function compareSubjects(
  scale: GradingScale,
  marks: readonly MarkFact[],
  subjectIds: readonly string[],
  current: DateRange,
  previous: DateRange | null,
): SubjectComparison[] {
  return subjectIds.map((subjectId) => {
    const own = marks.filter((m) => m.subjectId === subjectId);
    const cur = periodStats(scale, own, current);
    return {
      subjectId,
      count: cur.count,
      ...comparePeriods(scale, cur, previous && periodStats(scale, own, previous)),
    };
  });
}

/**
 * Movers (docs/design.md 6.1): every subject whose average went up or down against the previous instance, largest
 * change first. The screen applies its own limits (Внимание: up to 3 drops with 2+ marks and 1 rise; Предметы sorts
 * by it), core does not.
 */
export function movers(rows: readonly SubjectComparison[]): SubjectComparison[] {
  return rows
    .filter((r) => r.trend === 'up' || r.trend === 'down')
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
}

/** Sort orders of the Предметы list; subjects without marks always go last. */
export function sortSubjects(
  scale: GradingScale,
  rows: readonly SubjectComparison[],
  order: 'weak' | 'strong' | 'fell' | 'rose',
): SubjectComparison[] {
  const key = order === 'weak' || order === 'strong' ? 'average' : 'delta';
  const sign = order === 'weak' || order === 'fell' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0);
    // weak / fell: worst first; for a delta "worse" is a drop in the scale's direction
    return sign * compare(scale, x, y);
  });
}
