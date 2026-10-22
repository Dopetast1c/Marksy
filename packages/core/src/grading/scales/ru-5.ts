import type { GradingScale } from '../types';

/** Russia, 5 points (2 to 5 in practice), higher is better. Bands and the final rule are starting points to confirm. */
export const ru5: GradingScale = {
  id: 'ru-5',
  nameKey: 'scale.ru-5.name',
  kind: 'numeric',
  min: 1,
  max: 5,
  step: 1,
  higherIsBetter: true,
  bands: {
    critical: { from: 1, to: 2, labelKey: 'band.critical' },
    low: { from: 3, to: 3, labelKey: 'band.low' },
    good: { from: 4, to: 4, labelKey: 'band.good' },
    top: { from: 5, to: 5, labelKey: 'band.top' },
  },
  thresholds: [3, 4],
  goalTargets: [4, 5],
  averaging: { method: 'arithmetic', decimals: 2 },
  finalRule: 'round-half-up',
  yearRule: 'mean-of-term-finals',
  distribution: { mode: 'each-value' },
};
