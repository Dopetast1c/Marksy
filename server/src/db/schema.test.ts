import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { families, familyStudents, finalMarks, memberships, schoolYears, students, users } from './schema';

describe('schema', () => {
  const db = testDb();
  beforeEach(() => resetDb(db));

  it('has every table of docs/design.md 8', async () => {
    const { rows } = await db.$client.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    const names = rows.map((r) => r.tablename);
    for (const t of ['families', 'diary_accounts', 'lessons', 'marks', 'mark_history', 'mark_events', 'sync_runs']) {
      expect(names).toContain(t);
    }
    for (const t of ['sync_coverage', 'raw_responses', 'api_drift_events', 'lesson_tags', 'study_sessions']) {
      expect(names).toContain(t);
    }
  });

  it("a family delete takes its links and memberships; the child is not the family's and goes with the last link", async () => {
    const [f, g] = await db
      .insert(families)
      .values([{ name: 'Example' }, { name: 'Other' }])
      .returning();
    const [s] = await db
      .insert(students)
      .values({ providerId: 'demo-minimal', externalId: 'c-1', fullName: 'Student A' })
      .returning();
    const [u] = await db
      .insert(users)
      .values({ login: 'p@example.com', displayName: 'P', passwordHash: 'x' })
      .returning();
    await db.insert(memberships).values({ userId: u!.id, familyId: f!.id, role: 'admin' });
    await db.insert(familyStudents).values([
      { familyId: f!.id, studentId: s!.id },
      { familyId: g!.id, studentId: s!.id },
    ]);
    await db.delete(families).where(eq(families.id, f!.id));
    expect(await db.select().from(familyStudents)).toHaveLength(1);
    expect(await db.select().from(memberships)).toEqual([]);
    expect(await db.select().from(students)).toHaveLength(1);
    await db.delete(families).where(eq(families.id, g!.id));
    expect(await db.select().from(students)).toEqual([]);
  });

  it('one child per id in a system: a second identical child is refused', async () => {
    const child = { providerId: 'demo-full', externalId: 'p-1', fullName: 'Пример Ученик' };
    await db.insert(students).values(child);
    await expect(db.insert(students).values(child)).rejects.toThrow();
  });

  it('keeps one year final per subject (period null is a value, not a hole in the key)', async () => {
    const [s] = await db
      .insert(students)
      .values({ providerId: 'demo-minimal', externalId: 'c-1', fullName: 'Student A' })
      .returning();
    const [y] = await db
      .insert(schoolYears)
      .values({
        studentId: s!.id,
        providerId: 'demo-minimal',
        externalId: 'y',
        label: 'Y',
        startDate: '2025-09-01',
        endDate: '2026-05-31',
      })
      .returning();
    const row = {
      studentId: s!.id,
      schoolYearId: y!.id,
      subjectName: 'Math',
      raw: '8',
      kind: 'numeric',
      source: 'api' as const,
    };
    await db.insert(finalMarks).values(row);
    await expect(db.insert(finalMarks).values(row)).rejects.toThrow();
  });
});
