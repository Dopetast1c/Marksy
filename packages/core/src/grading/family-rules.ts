import { bandOf, compare, trendTolerance } from './scale';
import type { BandRole, GradingScale } from './types';

// The family's "what matters to us" rules (docs/design.md 6.4). Defaults come from the scale; the stored values are
// edited in the app ("What counts as a problem") and passed in wherever a rule asks "is this low" or "is this a drop".

export interface FamilyRules {
  /** Marks in these bands are "low" in Attention (screen.events) and hints. Default: the critical band. */
  lowMarkBands: BandRole[];
  /** Alternative to bands: a mark worse than this value is low. Wins over lowMarkBands when set. */
  lowMarkBelow?: number;
  /** Smallest drop of an average worth a row, in scale values. Default: the trend tolerance (0.3 on by-10). */
  dropStep: number;
  /** A drop needs at least this many marks in the current period. */
  dropMinMarks: number;
  /** Lessons without a mark before a subject counts as "No mark for a while" (lesson.signal.call). */
  callAfter: number;
}

export function defaultFamilyRules(scale: GradingScale): FamilyRules {
  return { lowMarkBands: ['critical'], dropStep: trendTolerance(scale), dropMinMarks: 2, callAfter: 4 };
}

export function isLowMark(scale: GradingScale, value: number, rules: FamilyRules): boolean {
  if (rules.lowMarkBelow != null) return compare(scale, value, rules.lowMarkBelow) < 0;
  const band = bandOf(scale, value);
  return band !== null && rules.lowMarkBands.includes(band);
}
