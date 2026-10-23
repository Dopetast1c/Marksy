import { and, eq, exists, sql } from 'drizzle-orm';
import type { AnyColumn, SQL } from 'drizzle-orm';
import type { Db } from './db/client';
import { familyStudents } from './db/schema';

// The only way to a child's data (docs/design.md 7.1, CLAUDE.md "Hard rules"): a child belongs to no family, so every
// query of child-owned rows (the diary and the child's own work) goes through an active family_students link of the
// current family. A suspended link serves nothing. Family-owned rows are filtered by family_id as before.

/** The children this family may see now: active links only */
export async function familyChildren(db: Db, familyId: string): Promise<string[]> {
  const rows = await db
    .select({ studentId: familyStudents.studentId })
    .from(familyStudents)
    .where(and(eq(familyStudents.familyId, familyId), eq(familyStudents.status, 'active')));
  return rows.map((r) => r.studentId);
}

/** Does this family follow this child now? */
export async function familySees(db: Db, familyId: string, studentId: string): Promise<boolean> {
  const [row] = await db
    .select({ studentId: familyStudents.studentId })
    .from(familyStudents)
    .where(
      and(
        eq(familyStudents.familyId, familyId),
        eq(familyStudents.studentId, studentId),
        eq(familyStudents.status, 'active'),
      ),
    );
  return !!row;
}

/**
 * A where-condition for any child-owned table: `studentColumn` belongs to a child the family follows now.
 * Use it in every query that reads child-owned rows for a family: `.where(and(seenBy(familyId, marks.studentId), ...))`.
 */
export function seenBy(familyId: string, studentColumn: AnyColumn): SQL {
  return exists(
    sql`(select 1 from ${familyStudents} where ${familyStudents.familyId} = ${familyId}
      and ${familyStudents.studentId} = ${studentColumn} and ${familyStudents.status} = 'active')`,
  );
}
