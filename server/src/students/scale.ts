import { getScale, manifestScale } from '@marksy/core';
import type { GradingScale } from '@marksy/core';
import { getProvider } from '@marksy/registry';
import { desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { MANIFEST_SCALE, schoolYears, students, studentYears } from '../db/schema';

// A child's grading scale (docs/providers.md 5.3, design.md 6.4): the scale of their latest school year as the
// collector stored it; before the first sync, the manifest's scale. null: a year without marks (ux-principles D49).

export async function studentScale(db: Db, studentId: string): Promise<GradingScale | null> {
  const [student] = await db
    .select({ providerId: students.providerId })
    .from(students)
    .where(eq(students.id, studentId));
  const provider = student ? getProvider(student.providerId) : undefined;
  const [year] = await db
    .select({ scaleId: studentYears.gradingScaleId })
    .from(studentYears)
    .innerJoin(schoolYears, eq(schoolYears.id, studentYears.schoolYearId))
    .where(eq(studentYears.studentId, studentId))
    .orderBy(desc(schoolYears.startDate))
    .limit(1);
  if (year) {
    if (year.scaleId === null) return null;
    if (year.scaleId !== MANIFEST_SCALE) return getScale(year.scaleId);
  }
  return provider ? manifestScale(provider.manifest) : null;
}
