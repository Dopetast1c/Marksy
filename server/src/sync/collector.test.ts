import { addUnknownFields } from '@marksy/core';
import type { TransportRequest } from '@marksy/core';
import { DEMO_FULL_FIXTURES, demoFullTransport, demoTransport, getProvider } from '@marksy/registry';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { createAccount, DEMO_CREDENTIALS } from '../../test/factories';
import {
  apiDriftEvents,
  attendance,
  familyStudents,
  finalMarks,
  lessonPrep,
  lessons,
  markEvents,
  markHistory,
  marks,
  rawResponses,
  students,
  studentSources,
  syncCoverage,
  syncRuns,
} from '../db/schema';
import { runCollector } from './collector';
import type { CollectorOptions, PlanSet, WeekRequest } from './collector';

const db = testDb();
const NOW = new Date('2025-09-19T09:00:00Z');

/** p-1 has marks in both weeks, p-2 (a class without marks) in the first */
const WEEKS: WeekRequest[] = [
  { weekStart: '2025-09-15', set: 'standing' },
  { weekStart: '2025-09-08', set: 'standing' },
];

type Fixtures = Record<string, unknown>;
const clone = <T>(v: T): T => structuredClone(v);

async function collect(
  account: { id: string; familyId: string; providerId: string },
  over: Partial<CollectorOptions> & { fixtures?: Fixtures; log?: TransportRequest[] } = {},
) {
  const { fixtures, log, ...rest } = over;
  const [run] = await db
    .insert(syncRuns)
    .values({
      familyId: account.familyId,
      diaryAccountId: account.id,
      providerId: account.providerId,
      kind: 'manual',
      trigger: 'cli',
      startedAt: NOW,
      status: 'running',
    })
    .returning();
  const provider = getProvider(account.providerId)!;
  return runCollector({
    db,
    provider,
    account,
    credentials: DEMO_CREDENTIALS,
    runId: run!.id,
    plan: () => WEEKS,
    transport:
      account.providerId === 'demo-full'
        ? demoFullTransport({ ...(fixtures && { fixtures }), ...(log && { log }) })
        : demoTransport(),
    sleep: async () => undefined,
    now: () => NOW,
    ...rest,
  });
}

/** demo-full's first week with one change applied to p-1's diary */
function week1(change: (days: { date: string; lessons: Record<string, unknown>[] }[]) => void): Fixtures {
  const w = clone(DEMO_FULL_FIXTURES['diary-1-w1']) as { days: { date: string; lessons: Record<string, unknown>[] }[] };
  change(w.days);
  return { 'diary-1-w1': w };
}

const lessonAt = (days: { date: string; lessons: Record<string, unknown>[] }[], date: string, n = 0) =>
  days.find((d) => d.date === date)!.lessons[n]! as { uid: string | null; marks: Record<string, unknown>[] };

describe('collector', () => {
  beforeEach(() => resetDb(db));

  it('a child two accounts show exists once, followed by both families, read through one account', async () => {
    const first = await createAccount(db, 'demo-full');
    const second = await createAccount(db, 'demo-full');
    const a = await collect(first.account);
    const b = await collect(second.account);
    expect(a.students.map((s) => s.externalId)).toEqual(['p-1', 'p-2']);
    // the second login shows the same children: linked to its family, but read only through the first account
    expect(b.students).toEqual([]);
    expect(await db.select().from(students)).toHaveLength(2);
    const links = await db.select().from(familyStudents);
    expect(links.filter((l) => l.familyId === second.family.id)).toHaveLength(2);
    const sources = await db.select().from(studentSources);
    expect(sources).toHaveLength(4);
    expect(sources.filter((s) => s.active).every((s) => s.diaryAccountId === first.account.id)).toBe(true);
  });

  it('stores a first run: students, lessons, marks, absences, finals, coverage', async () => {
    const { account } = await createAccount(db, 'demo-full');
    const result = await collect(account);
    expect(result.status).toBe('success');
    expect(result.students.map((s) => s.externalId)).toEqual(['p-1', 'p-2']);

    const pupils = await db.select().from(students);
    expect(pupils.find((s) => s.externalId === 'p-2')!.gradingScaleId).toBeNull();
    expect(pupils.find((s) => s.externalId === 'p-1')!.gradingScaleId).toBe('by-10');
    expect(await db.select().from(lessons)).toHaveLength(13);
    const allMarks = await db.select().from(marks);
    expect(allMarks.map((m) => m.raw).sort()).toEqual(['4', '5', '6', '7', '7/9', '8', '8', '9', 'зач']);
    // an absence is attendance, never a mark
    expect(await db.select().from(attendance)).toEqual([
      expect.objectContaining({ status: 'absent', source: 'derived' }),
    ]);
    expect((await db.select().from(markEvents)).every((e) => e.kind === 'new')).toBe(true);
    expect(await db.select().from(finalMarks)).toHaveLength(2);
    const coverage = await db.select().from(syncCoverage);
    expect(coverage).toHaveLength(4);
    expect(result.stats).toMatchObject({ weeks_verified: 4, new: 9, lessons: 13 });
  });

  it('keeps raw read responses, tagged by week, and never the login', async () => {
    const { account } = await createAccount(db, 'demo-full');
    await collect(account);
    const raw = await db.select().from(rawResponses);
    expect(raw.map((r) => r.endpoint)).not.toContain('POST /api/v2/auth');
    expect(JSON.stringify(raw)).not.toContain('demo-token');
    const diary = raw.filter((r) => r.endpoint === 'GET /api/v2/pupils/*/diary');
    expect(diary).toHaveLength(4);
    expect(diary.every((r) => r.studentId && r.weekStart)).toBe(true);
    expect(diary.map((r) => r.params.week).sort()).toEqual(['2025-09-08', '2025-09-08', '2025-09-15', '2025-09-15']);
  });

  it('a re-fetched week with a changed mark writes mark_history and mark_events(changed)', async () => {
    const { account } = await createAccount(db, 'demo-full');
    await collect(account);
    const result = await collect(account, {
      fixtures: week1((days) => {
        lessonAt(days, '2025-09-08').marks[0]!.value = '9';
        lessonAt(days, '2025-09-08').marks[0]!.note = 'Исправлено';
      }),
    });
    expect(result.stats).toMatchObject({ new: 0, changed: 1, removed: 0 });
    const [m] = await db.select().from(marks).where(eq(marks.externalId, 'M-1'));
    expect(m).toMatchObject({ raw: '9', values: [9], comment: 'Исправлено' });
    expect(m!.changedAt).toEqual(NOW);
    expect(await db.select().from(markHistory)).toEqual([
      expect.objectContaining({ markId: m!.id, rawMark: '8', comment: null }),
    ]);
    const changed = await db.select().from(markEvents).where(eq(markEvents.kind, 'changed'));
    expect(changed).toEqual([
      expect.objectContaining({ markId: m!.id, diff: { raw: ['8', '9'], comment: [null, 'Исправлено'] } }),
    ]);
  });

  it('marks a vanished mark removed, and restored when it comes back', async () => {
    const { account } = await createAccount(db, 'demo-full');
    await collect(account);
    const without = await collect(account, { fixtures: week1((days) => (lessonAt(days, '2025-09-12').marks = [])) });
    expect(without.stats).toMatchObject({ removed: 1 });
    const [gone] = await db.select().from(marks).where(eq(marks.externalId, 'M-6'));
    expect(gone!.removedAt).toEqual(NOW);

    const back = await collect(account);
    expect(back.stats).toMatchObject({ restored: 1, new: 0 });
    const kinds = (await db.select().from(markEvents).where(eq(markEvents.markId, gone!.id))).map((e) => e.kind);
    expect(kinds).toEqual(['new', 'removed', 'restored']);
    expect((await db.select().from(marks).where(eq(marks.externalId, 'M-6')))[0]!.removedAt).toBeNull();
  });

  it('keeps the row, tick and marks of a lesson whose id appears later', async () => {
    const { account } = await createAccount(db, 'demo-full');
    await collect(account);
    const [before] = await db.select().from(lessons).where(eq(lessons.externalId, 'slot:2025-09-09:1:phy'));
    await db.insert(lessonPrep).values({ studentId: before!.studentId, lessonId: before!.id, doneAt: NOW });

    await collect(account, { fixtures: week1((days) => (lessonAt(days, '2025-09-09').uid = 'L-103')) });
    const [after] = await db.select().from(lessons).where(eq(lessons.externalId, 'L-103'));
    expect(after!.id).toBe(before!.id);
    expect(after!.removedAt).toBeNull();
    expect(await db.select().from(lessonPrep)).toEqual([expect.objectContaining({ lessonId: before!.id })]);
    const [lab] = await db.select().from(marks).where(eq(marks.externalId, 'M-2'));
    expect(lab!.lessonId).toBe(before!.id);
    expect(await db.select().from(lessons).where(isNull(lessons.removedAt))).toHaveLength(13);
  });

  it('soft-deletes a lesson that disappeared from a re-fetched week', async () => {
    const { account } = await createAccount(db, 'demo-full');
    await collect(account);
    await collect(account, { fixtures: week1((days) => days.find((d) => d.date === '2025-09-12')!.lessons.splice(0)) });
    const [pe] = await db.select().from(lessons).where(eq(lessons.externalId, 'L-107'));
    expect(pe!.removedAt).toEqual(NOW);
  });

  it('records drift on unknown fields and does not throw; a known drift only counts', async () => {
    const { account } = await createAccount(db, 'demo-full');
    const odd = { 'diary-1-w1': addUnknownFields(DEMO_FULL_FIXTURES['diary-1-w1']) };
    const first = await collect(account, { fixtures: odd });
    expect(first.status).toBe('success');
    expect(first.newDrift.length).toBeGreaterThan(0);
    expect(first.newDrift.every((e) => e.kind === 'unknown_field')).toBe(true);
    const second = await collect(account, { fixtures: odd });
    expect(second.newDrift).toEqual([]);
    const rows = await db.select().from(apiDriftEvents);
    expect(rows.every((r) => r.count === 2 && r.providerId === 'demo-full')).toBe(true);
  });

  it('stops at the request budget; the rest stays unverified', async () => {
    const { account } = await createAccount(db, 'demo-full');
    // login, profile, then year and subjects per pupil = 6; two more are p-1's two standing weeks
    const result = await collect(account, { stricter: { maxRequestsPerRun: 8 } });
    expect(result.status).toBe('success');
    expect(result.requests).toBe(8);
    expect(result.verified.map((v) => v.weekStart)).toEqual(['2025-09-15', '2025-09-08']);
    expect(await db.select().from(finalMarks)).toEqual([]);
  });

  it('a provider failure after some weeks is partial; finished weeks stay verified', async () => {
    const { account } = await createAccount(db, 'demo-full');
    const result = await collect(account, {
      plan: ({ student }) => (student.externalId === 'p-1' ? WEEKS : []),
      transport: failingAfter(7),
    });
    expect(result).toMatchObject({ status: 'partial', errorClass: 'partial', error: 'ProviderUnavailableError 503' });
    expect(result.verified.length).toBeGreaterThan(0);
  });

  it('a rejected login fails as auth and stores nothing', async () => {
    const { account } = await createAccount(db, 'demo-full');
    const result = await collect(account, {
      transport: async () => ({ status: 401, headers: {}, text: '{"error":"bad credentials"}' }),
    });
    expect(result).toMatchObject({ status: 'failed', errorClass: 'auth', requests: 1 });
    expect(await db.select().from(students)).toEqual([]);
  });

  it('demo-minimal: unattached marks by term, every week of the year verified with one request', async () => {
    const { account } = await createAccount(db, 'demo-minimal');
    const result = await collect(account, { plan: () => [{ weekStart: '2026-09-06', set: 'standing' as PlanSet }] });
    expect(result.status).toBe('success');
    const c1 = (await db.select().from(students).where(eq(students.externalId, 'c-1')))[0]!;
    expect(
      await db
        .select()
        .from(marks)
        .where(and(eq(marks.studentId, c1.id))),
    ).toHaveLength(7);
    expect(await db.select().from(lessons)).toEqual([]);
    const weeks = await db.select().from(syncCoverage).where(eq(syncCoverage.studentId, c1.id));
    expect(weeks.length).toBeGreaterThan(40);
    expect(weeks.every((w) => w.weekStart.length === 10)).toBe(true);
  });
});

/** demo-full answers normally for the first `ok` requests, then 503 for every diary week */
function failingAfter(ok: number) {
  const inner = demoFullTransport();
  let n = 0;
  return async (req: TransportRequest) => {
    n++;
    if (n > ok && req.url.includes('/diary')) return { status: 503, headers: {}, text: '' };
    return inner(req);
  };
}
