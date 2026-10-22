import type { GradingScale } from '../types';

/**
 * Germany, 1 to 6 where 1 is best. The scale that proves direction-awareness: "worse than 4" means above 4, and the
 * average rounds half toward the better mark (2.5 gives 2). Bands and rules are starting points to confirm.
 */
export const de16: GradingScale = {
  id: 'de-1-6',
  nameKey: 'scale.de-1-6.name',
  kind: 'numeric',
  min: 1,
  max: 6,
  step: 1,
  higherIsBetter: false,
  bands: {
    critical: { from: 5, to: 6, labelKey: 'band.critical' },
    low: { from: 4, to: 4, labelKey: 'band.low' },
    good: { from: 2, to: 3, labelKey: 'band.good' },
    top: { from: 1, to: 1, labelKey: 'band.top' },
  },
  thresholds: [4, 3],
  goalTargets: [3, 2, 1],
  averaging: { method: 'arithmetic', decimals: 1 },
  finalRule: 'round-half-up',
  yearRule: 'unknown',
  distribution: { mode: 'each-value' },
};
