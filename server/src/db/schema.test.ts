import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { families, finalMarks, schoolYears, students } from './schema';

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

  it('cascades a family delete to everything under it', async () => {
    const [f] = await db.insert(families).values({ name: 'Example' }).returning();
    await db
      .insert(students)
      .values({ familyId: f!.id, providerId: 'demo-minimal', externalId: 'c-1', fullName: 'Student A' });
    await db.delete(families).where(sql`true`);
    expect(await db.select().from(students)).toEqual([]);
  });

  it('keeps one year final per subject (period null is a value, not a hole in the key)', async () => {
    const [f] = await db.insert(families).values({ name: 'Example' }).returning();
    const [s] = await db
      .insert(students)
      .values({ familyId: f!.id, providerId: 'demo-minimal', externalId: 'c-1', fullName: 'Student A' })
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
      familyId: f!.id,
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
