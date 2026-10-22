import type { GradingScale } from '../types';

/**
 * Ukraine, 12 points in four levels, higher is better. Semester marks come from thematic marks and the teacher, so
 * round-half-up is only the goal calculator's assumption; the year rule is unknown until a provider confirms it.
 */
export const ua12: GradingScale = {
  id: 'ua-12',
  nameKey: 'scale.ua-12.name',
  kind: 'numeric',
  min: 1,
  max: 12,
  step: 1,
  higherIsBetter: true,
  bands: {
    critical: { from: 1, to: 3, labelKey: 'band.critical' },
    low: { from: 4, to: 6, labelKey: 'band.low' },
    good: { from: 7, to: 9, labelKey: 'band.good' },
    top: { from: 10, to: 12, labelKey: 'band.top' },
  },
  thresholds: [4, 7],
  goalTargets: [7, 9, 10],
  averaging: { method: 'arithmetic', decimals: 1 },
  finalRule: 'round-half-up',
  yearRule: 'unknown',
  distribution: { mode: 'each-value' },
};
