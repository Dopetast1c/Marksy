import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../test/db';
import { createAccount } from '../test/factories';
import {
  apiDriftEvents,
  families,
  homeworkItems,
  invites,
  lessons,
  marks,
  markEvents,
  notifications,
  rawResponses,
  schoolYears,
  students,
  subjects,
  syncCoverage,
  syncDaily,
  syncRuns,
  terms,
  users,
} from './db/schema';
import { applyRetention, readRetention, RETENTION_DEFAULTS } from './retention';

const db = testDb();
const NOW = new Date('2026-03-10T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

async function world() {
  const { family, account } = await createAccount(db, 'demo-full');
  const [student] = await db
    .insert(students)
    .values({
      familyId: family.id,
      diaryAccountId: account.id,
      providerId: 'demo-full',
      externalId: 'p-1',
      fullName: 'Ученик А',
    })
    .returning();
  const year = async (label: string, start: string, end: string) =>
    (
      await db
        .insert(schoolYears)
        .values({
          studentId: student!.id,
          providerId: 'demo-full',
          externalId: label,
          label,
          startDate: start,
          endDate: end,
        })
        .returning()
    )[0]!;
  await year('2023-2024', '2023-09-01', '2024-05-31');
  await year('2024-2025', '2024-09-01', '2025-05-31');
  const current = await year('2025-2026', '2025-09-01', '2026-05-31');
  await db.insert(terms).values({
    schoolYearId: current.id,
    externalId: 'q3',
    kind: 'quarter',
    index: 3,
    label: '3',
    startDate: '2026-01-12',
    endDate: '2026-03-21',
  });
  const run = async (startedAt: Date, status: 'success' | 'failed' = 'success') =>
    (
      await db
        .insert(syncRuns)
        .values({
          familyId: family.id,
          diaryAccountId: account.id,
          providerId: 'demo-full',
          kind: 'scheduled',
          trigger: 'schedule',
          startedAt,
          status,
          requests: 10,
        })
        .returning()
    )[0]!;
  return { family, account, student: student!, current, run };
}

describe('retention janitor', () => {
  beforeEach(() => resetDb(db));

  it('reads overrides from the environment', () => {
    expect(readRetention({})).toEqual(RETENTION_DEFAULTS);
    expect(readRetention({ RETENTION_RAW_RESPONSES_DAYS: '7' }).rawResponsesDays).toBe(7);
    expect(() => readRetention({ RETENTION_SYNC_RUNS_DAYS: 'soon' })).toThrow(/RETENTION_SYNC_RUNS_DAYS/);
  });

  it('compacts sync runs older than 90 days into one line per day', async () => {
    const w = await world();
    await w.run(ago(100));
    await w.run(new Date(ago(100).getTime() + 3_600_000), 'failed');
    await w.run(ago(5));
    await applyRetention(db, RETENTION_DEFAULTS, NOW);
    expect(await db.select().from(syncRuns)).toHaveLength(1);
    expect(await db.select().from(syncDaily)).toEqual([
      expect.objectContaining({ runs: 2, failures: 1, requests: 20 }),
    ]);
  });

  it('drops raw bodies after 14 days but keeps the one that verified a week of the current term', async () => {
    const w = await world();
    const old = await w.run(ago(20));
    const body = {
      providerId: 'demo-full',
      endpoint: 'GET /x',
      status: 200,
      body: {},
      studentId: w.student.id,
      fetchedAt: ago(20),
    };
    await db.insert(rawResponses).values([
      { ...body, syncRunId: old.id, weekStart: '2026-02-16' },
      { ...body, syncRunId: old.id, weekStart: '2026-02-09' },
      { ...body, syncRunId: old.id, weekStart: null, studentId: null },
    ]);
    await db.insert(syncCoverage).values({
      studentId: w.student.id,
      weekStart: '2026-02-16',
      verifiedAt: ago(20),
      runId: old.id,
      status: 'verified',
    });
    await applyRetention(db, RETENTION_DEFAULTS, NOW);
    expect((await db.select().from(rawResponses)).map((r) => r.weekStart)).toEqual(['2026-02-16']);
  });

  it('keeps coverage of the current and the previous school year only', async () => {
    const w = await world();
    await db.insert(syncCoverage).values(
      ['2023-10-02', '2024-10-07', '2025-10-06'].map((weekStart) => ({
        studentId: w.student.id,
        weekStart,
        verifiedAt: NOW,
        status: 'verified' as const,
      })),
    );
    await applyRetention(db, RETENTION_DEFAULTS, NOW);
    expect((await db.select().from(syncCoverage)).map((c) => c.weekStart).sort()).toEqual(['2024-10-07', '2025-10-06']);
  });

  it('trims events, the inbox and acknowledged drift after 180 days; marks stay', async () => {
    const w = await world();
    const [subject] = await db
      .insert(subjects)
      .values({
        studentId: w.student.id,
        schoolYearId: w.current.id,
        providerId: 'demo-full',
        externalId: 'alg',
        name: 'Алгебра',
        nameNorm: 'алгебра',
      })
      .returning();
    const [lesson] = await db
      .insert(lessons)
      .values({
        familyId: w.family.id,
        studentId: w.student.id,
        providerId: 'demo-full',
        externalId: 'L-1',
        date: '2025-09-08',
        subjectId: subject!.id,
        subjectName: 'Алгебра',
      })
      .returning();
    const [mark] = await db
      .insert(marks)
      .values({
        familyId: w.family.id,
        studentId: w.student.id,
        providerId: 'demo-full',
        externalId: 'M-1',
        lessonId: lesson!.id,
        date: '2025-09-08',
        subjectId: subject!.id,
        raw: '8',
        kind: 'numeric',
        values: [8],
      })
      .returning();
    await db.insert(markEvents).values([
      { familyId: w.family.id, studentId: w.student.id, markId: mark!.id, kind: 'new', createdAt: ago(200) },
      { familyId: w.family.id, studentId: w.student.id, markId: mark!.id, kind: 'changed', createdAt: ago(10) },
    ]);
    const [admin] = await db
      .insert(users)
      .values({ familyId: w.family.id, role: 'admin', login: 'a@example.com', displayName: 'A', passwordHash: 'x' })
      .returning();
    await db
      .insert(notifications)
      .values({ userId: admin!.id, eventKey: 'k', severity: 'info', title: 't', createdAt: ago(181) });
    const drift = { providerId: 'demo-full', endpoint: 'diary', kind: 'unknown_field', firstSeenAt: ago(400) };
    await db.insert(apiDriftEvents).values([
      { ...drift, path: 'a', lastSeenAt: ago(300), acknowledgedAt: ago(250) },
      { ...drift, path: 'b', lastSeenAt: ago(1), acknowledgedAt: ago(250) },
      { ...drift, path: 'c', lastSeenAt: ago(300) },
    ]);
    await applyRetention(db, RETENTION_DEFAULTS, NOW);
    expect((await db.select().from(markEvents)).map((e) => e.kind)).toEqual(['changed']);
    expect(await db.select().from(notifications)).toEqual([]);
    expect((await db.select().from(apiDriftEvents)).map((d) => d.path).sort()).toEqual(['b', 'c']);
    expect(await db.select().from(marks)).toHaveLength(1);
  });

  it('expired codes go; a family limit removes old diary data of every kind', async () => {
    const w = await world();
    await db.insert(invites).values([
      { code: 'OLD-CODE', familyId: w.family.id, role: 'parent', expiresAt: ago(1) },
      { code: 'NEW-CODE', familyId: w.family.id, role: 'parent', expiresAt: new Date(NOW.getTime() + 86_400_000) },
    ]);
    await db
      .update(families)
      .set({ settings: { retention_years: 1 } })
      .where(eq(families.id, w.family.id));
    const [subject] = await db
      .insert(subjects)
      .values({
        studentId: w.student.id,
        schoolYearId: w.current.id,
        providerId: 'demo-full',
        externalId: 'alg',
        name: 'Алгебра',
        nameNorm: 'алгебра',
      })
      .returning();
    const mark = (externalId: string, date: string) => ({
      familyId: w.family.id,
      studentId: w.student.id,
      providerId: 'demo-full',
      externalId,
      date,
      subjectId: subject!.id,
      raw: '8',
      kind: 'numeric' as const,
      values: [8],
    });
    await db.insert(marks).values([mark('old', '2024-10-01'), mark('new', '2025-10-01')]);
    await db.insert(homeworkItems).values({
      familyId: w.family.id,
      studentId: w.student.id,
      title: 'Old',
      source: 'manual',
      dueDate: '2024-10-01',
    });
    await applyRetention(db, RETENTION_DEFAULTS, NOW);
    expect((await db.select().from(invites)).map((i) => i.code)).toEqual(['NEW-CODE']);
    expect((await db.select().from(marks)).map((m) => m.externalId)).toEqual(['new']);
    expect(await db.select().from(homeworkItems)).toEqual([]);
  });
});
