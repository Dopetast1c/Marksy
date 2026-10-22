import type { GradingScale } from '../types';

/**
 * Belarus, 10 points, higher is better. The reference scale: the interface in docs/mockups.html is this scale, and the
 * snapshot test (docs/providers.md 5.4) locks what it produces. finalRule round-half-up is assumed, not yet verified
 * against real term finals (docs/design.md 6.2).
 */
export const by10: GradingScale = {
  id: 'by-10',
  nameKey: 'scale.by-10.name',
  kind: 'numeric',
  min: 1,
  max: 10,
  step: 1,
  higherIsBetter: true,
  bands: {
    critical: { from: 1, to: 4, labelKey: 'band.critical' },
    low: { from: 5, to: 6, labelKey: 'band.low' },
    good: { from: 7, to: 8, labelKey: 'band.good' },
    top: { from: 9, to: 10, labelKey: 'band.top' },
  },
  thresholds: [5, 7],
  goalTargets: [7, 8, 9],
  averaging: { method: 'arithmetic', decimals: 1 },
  finalRule: 'round-half-up',
  yearRule: 'mean-of-term-finals',
  distribution: { mode: 'each-value' },
};
