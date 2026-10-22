import type { Calendar } from '../model/schemas';
import type { ProviderManifest } from '../providers/manifest';
import { BUILT_IN_SCALES } from './scales';
import { gradingScale } from './types';
import type { GradingScale } from './types';

/** A built-in scale by id; throws for an unknown id, which is a manifest bug. */
export function getScale(id: string): GradingScale {
  const s = BUILT_IN_SCALES[id];
  if (!s) throw new Error(`Unknown grading scale ${id}`);
  return s;
}

/** The manifest's default scale, by id or inline. */
export function manifestScale(manifest: ProviderManifest): GradingScale {
  return typeof manifest.gradingScale === 'string'
    ? getScale(manifest.gradingScale)
    : gradingScale.parse(manifest.gradingScale);
}

/**
 * The scale of one student in one school year (stored as student_years.grading_scale_id). null means the year has no
 * marks at all: the no-marks mode of Главная, Предметы and Предмет follows from this and from nothing else, never from
 * a grade number, since the age at which marks start differs per country (docs/providers.md 5.3).
 */
export function studentYearScale(
  manifest: ProviderManifest,
  calendar: Pick<Calendar, 'gradingScaleId'>,
): GradingScale | null {
  if (calendar.gradingScaleId === null) return null;
  return calendar.gradingScaleId === undefined ? manifestScale(manifest) : getScale(calendar.gradingScaleId);
}

/** Does this student year have marks? The UI's switch for the no-marks variants. */
export function yearHasMarks(scale: GradingScale | null): scale is GradingScale {
  return scale !== null;
}
