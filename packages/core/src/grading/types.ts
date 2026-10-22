import { z } from 'zod';

// The grading scale model (docs/providers.md section 5.1). A scale is plain data so the API can send it to the web app
// as JSON; formatting and arithmetic live in the helpers in scale.ts and format.ts, which both sides import.
// Nothing outside packages/core/src/grading knows a mark value, a band edge, a threshold or a rounding rule.

export const BAND_ROLES = ['critical', 'low', 'good', 'top'] as const;
export const bandRole = z.enum(BAND_ROLES);
export type BandRole = z.infer<typeof bandRole>;

/** A closed range of scale values. null: the band is empty on this scale (ru-5 has no room for four ranges). */
const band = z
  .object({ from: z.number(), to: z.number(), labelKey: z.string() })
  .refine((b) => b.from <= b.to, 'band.from must not exceed band.to')
  .nullable();

export const gradingScale = z.object({
  id: z.string().min(1),
  /** i18n key, e.g. 'scale.by-10.name' */
  nameKey: z.string(),
  kind: z.enum(['numeric', 'letter', 'ordinal', 'percent', 'points', 'pass-fail']),
  min: z.number(),
  max: z.number(),
  step: z.number().positive(),
  higherIsBetter: z.boolean(),
  letters: z.array(z.object({ label: z.string(), value: z.number(), fromPercent: z.number().optional() })).optional(),
  modifiers: z.object({ plus: z.number(), minus: z.number() }).optional(),
  bands: z.object({ critical: band, low: band, good: band, top: band }),
  /** "Worse than X" values for filters and alert rules, in scale values, strictest first. */
  thresholds: z.array(z.number()),
  /** Finals offered in the goal picker. */
  goalTargets: z.array(z.number()),
  averaging: z.object({
    method: z.enum(['arithmetic', 'weighted', 'gpa', 'mode', 'none']),
    decimals: z.number().int().min(0).max(3),
  }),
  /** How a term final follows from the marks; an assumption until verified against real finals. */
  finalRule: z.enum([
    'round-half-up',
    'round-half-even',
    'floor',
    'ceil',
    'weighted-round',
    'teacher-decides',
    'unknown',
  ]),
  /** How the year final relates to the terms; drives the italic year estimate. */
  yearRule: z.enum([
    'mean-of-term-finals',
    'mean-of-all-marks',
    'last-term',
    'weighted-terms',
    'teacher-decides',
    'unknown',
  ]),
  distribution: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('each-value') }),
    z.object({ mode: z.literal('buckets'), width: z.number().positive() }),
  ]),
});
export type GradingScale = z.infer<typeof gradingScale>;
