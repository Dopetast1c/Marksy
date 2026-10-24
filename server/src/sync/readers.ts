import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { students, studentSources } from '../db/schema';

// Read-only questions about an account's children, with no way to the providers: `pnpm sync:plan` loads this and
// must never be able to log in (plan-report.test.ts checks its import graph).

export type StudentRow = typeof students.$inferSelect;

/** The children an account is the active source of, as stored (the planner's view before any login) */
export async function readableStudents(db: Db, accountId: string): Promise<StudentRow[]> {
  const rows = await db
    .select({ student: students })
    .from(studentSources)
    .innerJoin(students, eq(students.id, studentSources.studentId))
    .where(
      and(eq(studentSources.diaryAccountId, accountId), eq(studentSources.active, true), eq(students.isActive, true)),
    );
  return rows.map((r) => r.student);
}

/** Every child an account is a source of, active or not */
export async function sourcedStudents(db: Db, accountId: string): Promise<string[]> {
  const rows = await db
    .select({ studentId: studentSources.studentId })
    .from(studentSources)
    .where(eq(studentSources.diaryAccountId, accountId));
  return rows.map((r) => r.studentId);
}
