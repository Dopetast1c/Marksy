import { average, compare, scaleValues } from './scale';
import type { Weighted } from './scale';
import { clean, roundHalfUp } from './round';
import type { GradingScale } from './types';

// Finals and the goal calculator (docs/design.md 6.2). The final rule of a scale is an assumption until verified
// against real finals; rules that cannot be inverted ('teacher-decides', 'unknown') give null and the goal card hides.

const clamp = (scale: GradingScale, v: number) => Math.min(scale.max, Math.max(scale.min, v));
/** The smallest step an average is shown with: 0.1 on by-10. */
const shownStep = (scale: GradingScale) => 10 ** -scale.averaging.decimals;

/**
 * The term final the marks currently point to, per scale.finalRule. "Half up" means half toward the better mark,
 * so on de-1-6 (1 is best) 2.5 gives 2. null for rules that are not arithmetic.
 */
export function projectFinal(scale: GradingScale, avg: number | null): number | null {
  if (avg == null) return null;
  const s = scale.step;
  // work in "quality units": larger is better, whatever the direction
  const q = clean((scale.higherIsBetter ? avg : -avg) / s);
  let r: number;
  switch (scale.finalRule) {
    case 'round-half-up':
    case 'weighted-round':
      r = Math.floor(q + 0.5);
      break;
    case 'round-half-even': {
      const f = Math.floor(q);
      const diff = clean(q - f);
      r = diff > 0.5 ? f + 1 : diff < 0.5 ? f : f % 2 === 0 ? f : f + 1;
      break;
    }
    case 'floor':
      r = Math.floor(q);
      break;
    case 'ceil':
      r = Math.ceil(q);
      break;
    default:
      return null;
  }
  return clamp(scale, roundHalfUp((scale.higherIsBetter ? r : -r) * s, 6));
}

/**
 * The lowest average (in the scale's direction) that still gives `final`: 7.5 for an 8 on by-10, 2.5 for a 2 on
 * de-1-6. null when the final rule cannot be inverted.
 */
export function neededAverage(scale: GradingScale, final: number): number | null {
  const dir = scale.higherIsBetter ? 1 : -1;
  switch (scale.finalRule) {
    case 'round-half-up':
    case 'round-half-even':
    case 'weighted-round':
      return roundHalfUp(final - (dir * scale.step) / 2, 6);
    case 'floor':
      return final;
    case 'ceil':
      return roundHalfUp(final - dir * (scale.step - shownStep(scale)), 6);
    default:
      return null;
  }
}

/** Has the average reached the needed one? */
export function reachedAverage(scale: GradingScale, avg: number, need: number): boolean {
  return compare(scale, avg, need) >= 0;
}

export interface PlanOption {
  /** The mark value */
  value: number;
  /** How many marks of that value */
  count: number;
}

/**
 * The fewest marks of each value that lift the average to `need`, best values first: "ещё 2 × 9 или 1 × 10".
 * Options needing more than `maxCount` marks are dropped as unrealistic.
 */
export function targetPlan(scale: GradingScale, sum: number, count: number, need: number, maxCount = 12): PlanOption[] {
  const out: PlanOption[] = [];
  const better = scaleValues(scale)
    .filter((v) => compare(scale, v, need) > 0)
    .sort((a, b) => compare(scale, b, a));
  for (const value of better) {
    const n = Math.ceil(clean((need * count - sum) / (value - need)));
    if (n > 0 && n <= maxCount) out.push({ value, count: n });
  }
  return out;
}

/** The worst next mark that keeps the average at `need`: "чтобы не потерять, следующая не ниже 7". */
export function keepMark(scale: GradingScale, need: number, sum: number, count: number): number {
  const raw = clean((need * (count + 1) - sum) / scale.step);
  const v = (scale.higherIsBetter ? Math.ceil(raw) : Math.floor(raw)) * scale.step;
  return clamp(scale, roundHalfUp(v, 6));
}

export interface GoalStatus {
  target: number;
  /** The final the current marks point to */
  projected: number | null;
  /** The average needed for the target */
  need: number;
  reached: boolean;
  /** When not reached: the options to get there (may be empty when out of reach for now) */
  plan: PlanOption[];
  /** When reached: the worst next mark that keeps it */
  keep: number | null;
}

/** The goal a subject starts with until the family picks one (design.md 5.4): the scale's middle goal, 8 on by-10 */
export function defaultGoal(scale: GradingScale): number | null {
  const t = scale.goalTargets;
  return t.length ? t[Math.min(1, t.length - 1)]! : null;
}

/** The goal card's numbers for a subject's term (docs/design.md 6.2); null when the scale's final rule is not arithmetic. */
export function marksNeeded(scale: GradingScale, sum: number, count: number, target: number): GoalStatus | null {
  const need = neededAverage(scale, target);
  if (need == null) return null;
  const avg = count ? roundHalfUp(sum / count, scale.averaging.decimals) : null;
  const reached = avg != null && reachedAverage(scale, avg, need);
  return {
    target,
    projected: projectFinal(scale, avg),
    need,
    reached,
    plan: reached ? [] : targetPlan(scale, sum, count, need),
    keep: reached ? keepMark(scale, need, sum, count) : null,
  };
}

/**
 * The year value shown in italics until the year final is posted, per scale.yearRule. by-10: the mean of the term
 * finals posted so far, never the mean of all marks.
 */
export function estimateYear(
  scale: GradingScale,
  termFinals: readonly number[],
  marks: readonly Weighted[],
): number | null {
  switch (scale.yearRule) {
    case 'mean-of-term-finals':
      return average(scale, [{ values: termFinals }]);
    case 'mean-of-all-marks':
      return average(scale, marks);
    case 'last-term':
      return termFinals.length ? termFinals[termFinals.length - 1]! : null;
    default:
      return null;
  }
}
