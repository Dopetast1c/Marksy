import { clean, roundHalfUp } from './round';
import { BAND_ROLES } from './types';
import type { BandRole, GradingScale } from './types';

// Direction-aware helpers over a GradingScale (docs/providers.md 5.1). Nothing else in the code compares mark values
// directly: "better", "worse", "low" and "how far" always go through here, so a scale where 1 is best just works.

/** Bands that exist on this scale, worst first. */
export function activeBands(scale: GradingScale): BandRole[] {
  return BAND_ROLES.filter((r) => scale.bands[r] !== null);
}

/** 1 when a is better than b, -1 when worse, 0 when equal. */
export function compare(scale: GradingScale, a: number, b: number): -1 | 0 | 1 {
  const d = clean(a - b);
  if (d === 0) return 0;
  return d > 0 === scale.higherIsBetter ? 1 : -1;
}

/** "Below 5" / "Worse than 4" (threshold.below, threshold.worse): strictly worse than the threshold. */
export function isWorseThan(scale: GradingScale, value: number, threshold: number): boolean {
  return compare(scale, value, threshold) < 0;
}

/** 0 = worst value of the scale, 1 = best; for comparing across scales. */
export function toQuality(scale: GradingScale, value: number): number {
  const q = (value - scale.min) / (scale.max - scale.min);
  return Math.min(1, Math.max(0, scale.higherIsBetter ? q : 1 - q));
}

/**
 * One by-10 point scaled to this range: 1.0 on by-10, 0.44 on ru-5. Rules written in by-10 units (0.3 for a trend,
 * 1.0 for a work-type gap) multiply by it.
 */
export function scaleUnit(scale: GradingScale): number {
  return (scale.max - scale.min) / 9;
}

/** Smallest change of an average that earns a trend arrow: 0.3 on by-10. */
export function trendTolerance(scale: GradingScale): number {
  return 0.3 * scaleUnit(scale);
}

/** Every value a mark can take, from min to max by step. */
export function scaleValues(scale: GradingScale): number[] {
  const out: number[] = [];
  for (let v = scale.min; v <= scale.max + 1e-9; v += scale.step) out.push(roundHalfUp(v, 6));
  return out;
}

/**
 * The band a value (a mark or an average) falls in. A value between two bands belongs to the worse one until it
 * reaches the better band's edge: on by-10, 6.5 is low and 8.5 is good, 9.0 is top. Out-of-range values clamp.
 */
export function bandOf(scale: GradingScale, value: number | null | undefined): BandRole | null {
  if (value == null || Number.isNaN(value)) return null;
  let found: BandRole | null = null;
  for (const role of activeBands(scale)) {
    const b = scale.bands[role]!;
    // the band's worse edge: its lower bound when higher is better, its upper bound otherwise
    const worseEdge = scale.higherIsBetter ? b.from : b.to;
    if (found === null || compare(scale, value, worseEdge) >= 0) found = role;
  }
  return found;
}

/** The chip colour of a mark: the band of its worst value ("7/9" is coloured by the 7). null for non-numeric marks. */
export function markBand(scale: GradingScale, values: readonly number[]): BandRole | null {
  if (!values.length) return null;
  const worst = values.reduce((w, v) => (compare(scale, v, w) < 0 ? v : w));
  return bandOf(scale, worst);
}

/** Sparkline and chart reference lines: the edge into the low band and the edge into the top band. */
export function boundaryLines(scale: GradingScale): number[] {
  const edge = (role: BandRole) => {
    const b = scale.bands[role];
    return b ? (scale.higherIsBetter ? b.from : b.to) : null;
  };
  return [edge('low'), edge('top')].filter((v): v is number => v !== null);
}

/** Columns of the distribution chart: every value, or fixed-width buckets [from, to). */
export function distributionBuckets(scale: GradingScale): { from: number; to: number }[] {
  if (scale.distribution.mode === 'each-value') return scaleValues(scale).map((v) => ({ from: v, to: v }));
  const out: { from: number; to: number }[] = [];
  const { width } = scale.distribution;
  for (let from = scale.min; from < scale.max; from += width) {
    out.push({ from, to: Math.min(scale.max, from + width) });
  }
  return out;
}

export interface Weighted {
  values: readonly number[];
  weight?: number;
}

/**
 * The period average per scale.averaging, rounded half up to the scale's decimals. null when there is nothing to
 * average: missing data is a state, never a zero (docs/design.md 6.1). Each value of a double mark counts once.
 */
export function average(scale: GradingScale, marks: readonly Weighted[]): number | null {
  const { method, decimals } = scale.averaging;
  if (method === 'none') return null;
  const values = marks.flatMap((m) => m.values.map((v) => ({ v, w: method === 'weighted' ? (m.weight ?? 1) : 1 })));
  if (!values.length) return null;
  if (method === 'mode') {
    const counts = new Map<number, number>();
    for (const { v } of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    // most common; a tie goes to the better value
    return [...counts].sort((x, y) => y[1] - x[1] || compare(scale, y[0], x[0]))[0]![0];
  }
  const total = values.reduce((s, x) => s + x.w, 0);
  return roundHalfUp(values.reduce((s, x) => s + x.v * x.w, 0) / total, decimals);
}

/** Sum and count of the numeric values, the input of the goal calculator. */
export function sumCount(marks: readonly Weighted[]): { sum: number; count: number } {
  const values = marks.flatMap((m) => m.values);
  return { sum: values.reduce((a, b) => a + b, 0), count: values.length };
}
