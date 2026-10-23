import { and, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../test/db';
import { familyChildren, familySees, seenBy } from './access';
import { families, familyStudents, schoolYears, students } from './db/schema';

const db = testDb();

async function world() {
  const [a, b] = await db
    .insert(families)
    .values([{ name: 'A' }, { name: 'B' }])
    .returning();
  const [shared, onlyA] = await db
    .insert(students)
    .values([
      { providerId: 'demo-full', externalId: 'p-1', fullName: 'Пример Ученик А' },
      { providerId: 'demo-full', externalId: 'p-2', fullName: 'Пример Ученик Б' },
    ])
    .returning();
  await db.insert(familyStudents).values([
    { familyId: a!.id, studentId: shared!.id },
    { familyId: a!.id, studentId: onlyA!.id },
    { familyId: b!.id, studentId: shared!.id },
  ]);
  return { a: a!.id, b: b!.id, shared: shared!.id, onlyA: onlyA!.id };
}

describe('the way to a child', () => {
  beforeEach(() => resetDb(db));

  it('a family sees the children it follows, a shared child from both families', async () => {
    const w = await world();
    expect((await familyChildren(db, w.a)).sort()).toEqual([w.shared, w.onlyA].sort());
    expect(await familyChildren(db, w.b)).toEqual([w.shared]);
    expect(await familySees(db, w.b, w.onlyA)).toBe(false);
  });

  it('a suspended link serves nothing', async () => {
    const w = await world();
    await db
      .update(familyStudents)
      .set({ status: 'suspended' })
      .where(and(eq(familyStudents.familyId, w.b), eq(familyStudents.studentId, w.shared)));
    expect(await familySees(db, w.b, w.shared)).toBe(false);
    expect(await familyChildren(db, w.b)).toEqual([]);
    expect(await familySees(db, w.a, w.shared)).toBe(true);
  });

  it('seenBy filters child-owned rows by the current family', async () => {
    const w = await world();
    const year = {
      providerId: 'demo-full',
      externalId: 'y',
      label: 'Y',
      startDate: '2025-09-01',
      endDate: '2026-05-31',
    };
    await db.insert(schoolYears).values([
      { ...year, studentId: w.shared },
      { ...year, studentId: w.onlyA },
    ]);
    const visible = (familyId: string) =>
      db.select({ studentId: schoolYears.studentId }).from(schoolYears).where(seenBy(familyId, schoolYears.studentId));
    expect((await visible(w.a)).length).toBe(2);
    expect((await visible(w.b)).map((r) => r.studentId)).toEqual([w.shared]);
  });
});
