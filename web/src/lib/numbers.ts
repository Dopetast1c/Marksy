import { formatAverage, formatBandRange, formatValue } from '@marksy/core';
import type { GradingScale } from '@marksy/core';
import { intlLocale } from '../i18n';

// The one way the app writes a number of the scale (docs/i18n.md 2): averages, "было", goals, finals, band ranges.
// The decimals are the child's scale's, the separator the interface language's (ru «8,3», en «8.3»); nothing is
// written with toFixed or a separator of its own. Lint keeps core's formatters out of every other file.

export interface Numbers {
  /** an average with the scale's decimals: «7,5»; «—» for none */
  average: (v: number | null) => string;
  /** a mark, a final, a goal: «8», «4,5» on a half-step scale */
  value: (v: number | null) => string;
  /** a band's range: «5–6» */
  range: (band: keyof GradingScale['bands']) => string;
}

export function numbers(scale: GradingScale, locale = intlLocale()): Numbers {
  return {
    average: (v) => formatAverage(scale, v, locale),
    value: (v) => formatValue(scale, v, locale),
    range: (band) => formatBandRange(scale, band, locale) ?? '',
  };
}
