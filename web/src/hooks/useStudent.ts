import { useMe } from '../api/queries';
import type { StudentSummary } from '../api/queries';

// The selected child's own world (ux-principles D53): provider, capabilities, grading scale and school timezone are
// the child's, not the family's. Every scale- or capability-dependent element reads these hooks; no component checks
// a provider id or assumes a number of the scale (CLAUDE.md "Provider boundary").

export function useStudent(studentId: string | undefined): StudentSummary | null {
  const me = useMe();
  return me.data?.students.find((s) => s.id === studentId) ?? null;
}

/** The child's grading scale, or null for a year without marks (D49) */
export const useScale = (studentId: string | undefined) => useStudent(studentId)?.gradingScale ?? null;

export const useCapabilities = (studentId: string | undefined) => useStudent(studentId)?.capabilities ?? null;

/** The school's timezone: "today" and "now" are the school's (lib/time.ts) */
export const useSchoolTz = (studentId: string | undefined) => useStudent(studentId)?.timezone ?? 'UTC';
