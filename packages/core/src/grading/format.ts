import type { GradingScale } from './types';

// Scale-aware formatting through Intl, so 8.3 reads "8,3" in Russian and "8.3" in English (docs/i18n.md 2).
// The no-value sign is "—": missing data is never shown as 0.

export const NO_VALUE = '—';

const decimalsOfStep = (step: number) => (Number.isInteger(step) ? 0 : (String(step).split('.')[1]?.length ?? 0));

function number(locale: string, v: number, min: number, max: number) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    useGrouping: false,
  }).format(v);
}

/** A single mark value: "8", "A-", "17,5", "87 %". */
export function formatValue(scale: GradingScale, v: number | null, locale: string): string {
  if (v == null) return NO_VALUE;
  if (scale.letters?.length) {
    const exact = scale.letters.find((l) => Math.abs(l.value - v) < 1e-9);
    if (exact) return exact.label;
  }
  const s = number(locale, v, 0, decimalsOfStep(scale.step));
  return scale.kind === 'percent' ? `${s}%` : s;
}

/** An average with the scale's fixed decimals: "8.3", "3.67". */
export function formatAverage(scale: GradingScale, a: number | null, locale: string): string {
  if (a == null) return NO_VALUE;
  const d = scale.averaging.decimals;
  const s = number(locale, a, d, d);
  return scale.kind === 'percent' ? `${s}%` : s;
}

/** A term or year final: like a value. */
export function formatFinal(scale: GradingScale, v: number | null, locale: string): string {
  return formatValue(scale, v, locale);
}

/** The range label of a band column: "1–4", "5", "0–49%". */
export function formatBandRange(scale: GradingScale, role: keyof GradingScale['bands'], locale: string): string | null {
  const b = scale.bands[role];
  if (!b) return null;
  return b.from === b.to
    ? formatValue(scale, b.from, locale)
    : `${formatValue(scale, b.from, locale)}–${formatValue(scale, b.to, locale)}`;
}
