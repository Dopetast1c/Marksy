import type { GradingScale } from '../types';

/**
 * Percent, 0 to 100, higher is better; continuous assessment without an official term rule, so there is no goal
 * projection (finalRule unknown) and the year value is the mean of all marks. Used by providers/demo-minimal.
 */
export const pct100: GradingScale = {
  id: 'pct-100',
  nameKey: 'scale.pct-100.name',
  kind: 'percent',
  min: 0,
  max: 100,
  step: 1,
  higherIsBetter: true,
  bands: {
    critical: { from: 0, to: 49, labelKey: 'band.critical' },
    low: { from: 50, to: 64, labelKey: 'band.low' },
    good: { from: 65, to: 84, labelKey: 'band.good' },
    top: { from: 85, to: 100, labelKey: 'band.top' },
  },
  thresholds: [50, 65],
  goalTargets: [75, 85],
  averaging: { method: 'arithmetic', decimals: 1 },
  finalRule: 'unknown',
  yearRule: 'mean-of-all-marks',
  distribution: { mode: 'buckets', width: 10 },
};
