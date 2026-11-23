import { addDays, CADENCE_OPTIONS, defaultPreset, resolveCadence } from '@marksy/core';
import type { ChildSyncSettings, DayEstimateInput, ProviderManifest, SyncCadence, SyncMode } from '@marksy/core';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { families, familyStudents, students } from '../db/schema';
import { cadenceOf } from './cadence';
import { effectiveLimits } from './config';
import type { SyncConfig } from './config';
import { isSchoolDay, termWeeks } from './plan';
import { childDayOf, storedPlanCalendar, weekContext } from './state';
import { boundWindows, childWindow } from './window';

// A child's sync mode as Family → the child shows it (family.sync.title; docs/design.md 10.2, ux-principles D63): what
// this family chose, what the child is read with (several families: the most frequent of each setting), the settings
// the child's provider can serve, and what the app needs to estimate a school day as the settings change.

/** The settings each provider offers; the rest are always offered */
const NEEDS: Partial<Record<keyof SyncCadence, 'futureTimetable' | 'finalMarks'>> = {
  nextWeek: 'futureTimetable',
  finals: 'finalMarks',
};

/** How far ahead a school day with a known window is looked for, for the estimate */
const ESTIMATE_HORIZON = 21;
/** A term's weeks when no term is stored yet */
const TYPICAL_TERM_WEEKS = 9;

export interface ChildSyncView {
  /** The family's choice; null: the default of the child's year (`defaultMode`), which follows a change of year */
  mode: SyncMode | null;
  defaultMode: 'marks' | 'noMarks';
  /** This family's settings, resolved */
  settings: SyncCadence;
  /** What the child is read with: the most frequent setting of every family that follows the child */
  effective: SyncCadence;
  /** The settings the child's provider can serve, in display order */
  offered: (keyof SyncCadence)[];
  estimate: DayEstimateInput;
}

export async function childSyncView(
  db: Db,
  familyId: string,
  studentId: string,
  manifest: ProviderManifest,
  config: SyncConfig,
  now: Date,
): Promise<ChildSyncView | null> {
  const [row] = await db
    .select({ settings: familyStudents.settings, scale: students.gradingScaleId })
    .from(familyStudents)
    .innerJoin(students, eq(students.id, familyStudents.studentId))
    .where(and(eq(familyStudents.familyId, familyId), eq(familyStudents.studentId, studentId)));
  if (!row) return null;
  const hasMarks = row.scale != null;
  const chosen: ChildSyncSettings | undefined = row.settings.sync;
  const offered = (Object.keys(CADENCE_OPTIONS) as (keyof SyncCadence)[]).filter((k) => {
    const need = NEEDS[k];
    return !need || manifest.capabilities[need];
  });
  return {
    mode: chosen?.mode ?? null,
    defaultMode: defaultPreset(hasMarks) as 'marks' | 'noMarks',
    settings: resolveCadence(chosen, hasMarks),
    effective: await cadenceOf(db, studentId),
    offered,
    estimate: await estimateInput(db, familyId, studentId, manifest, config, now),
  };
}

/** The child's next school day's window (today's when school is today), the term's weeks and the provider's limits */
async function estimateInput(
  db: Db,
  familyId: string,
  studentId: string,
  manifest: ProviderManifest,
  config: SyncConfig,
  now: Date,
): Promise<DayEstimateInput> {
  const [family] = await db.select({ settings: families.settings }).from(families).where(eq(families.id, familyId));
  const limits = effectiveLimits(manifest, config);
  const ctx = weekContext(manifest, family?.settings ?? {}, now, null);
  const cal = await storedPlanCalendar(db, studentId, ctx.today);
  const span = (w: readonly [number, number] | null | undefined) => (w ? w[1] - w[0] : null);
  let windowMinutes = span(limits.standIn) ?? 6 * 60;
  for (let i = 0; i <= ESTIMATE_HORIZON; i++) {
    const date = addDays(ctx.today, i);
    if (cal && !isSchoolDay(date, cal, ctx)) continue;
    // without a stored calendar, childDayOf falls back to the manifest's school days (no window on another day)
    const window = childWindow(await childDayOf(db, studentId, date, cal, ctx), limits.standIn).window;
    const bounded = window ? boundWindows([window], limits.envWindow)[0] : null;
    if (bounded) {
      windowMinutes = span(bounded) ?? windowMinutes;
      break;
    }
  }
  const term = cal?.terms.find((t) => t.start <= ctx.today && t.end >= ctx.today);
  const unit = manifest.limits.fetchUnit;
  return {
    windowMinutes,
    intervalMinutes: limits.minLoginIntervalMinutes,
    weekRequests: unit === 'day' ? manifest.calendar.schoolDays.length : 1,
    schoolDays: manifest.calendar.schoolDays.length,
    termWeeks: cal && term ? termWeeks(cal, term, ctx).length : TYPICAL_TERM_WEEKS,
    readsAhead: manifest.capabilities.futureTimetable,
    finalMarks: manifest.capabilities.finalMarks,
  };
}
