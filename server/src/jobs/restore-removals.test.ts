import { demoFullTransport, getProvider } from '@marksy/registry';
import { eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { createAccount, DEMO_CREDENTIALS } from '../../test/factories';
import {
  finalMarks,
  finalMarksRaw,
  lessons,
  markEvents,
  marks,
  schoolYears,
  students,
  subjects,
  syncRuns,
  terms,
} from '../db/schema';
import { runCollector } from '../sync/collector';
import { remapStoredFinalsWith, restoreFalseRemovals } from './restore-removals';
import { runJobs } from './runner';
import type { BackgroundJob } from './runner';

// The one-time jobs of 1.0.1 (D61) on fictional data: a closed term's weeks emptied by the old upsert come back, a
// mark the teacher really deleted stays removed, nothing new appears in the feed, a second run changes nothing; and
// the finals of a stored response are mapped again.

const db = testDb();
const NOW = new Date('2025-09-19T09:00:00Z');
const NOVEMBER = new Date('2025-11-14T09:00:00Z');

async function collectOnce() {
  const { account } = await createAccount(db, 'demo-full');
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
  await runCollector({
    db,
    provider: getProvider('demo-full')!,
    account,
    credentials: DEMO_CREDENTIALS,
    runId: run!.id,
    plan: () => [
      { weekStart: '2025-09-15', set: 'standing' },
      { weekStart: '2025-09-08', set: 'standing' },
    ],
    transport: demoFullTransport(),
    sleep: async () => undefined,
    now: () => NOW,
  });
}

/** What the upsert before 1.0.1 did: every record of the week soft-removed at once, a 'removed' event per mark */
async function oldRemoval(week: [string, string], at: Date, only?: string[]) {
  const ms = (await db.select().from(marks).where(isNull(marks.removedAt))).filter(
    (m) => m.date >= week[0] && m.date <= week[1] && (!only || only.includes(m.externalId)),
  );
  await db
    .update(marks)
    .set({ removedAt: at })
    .where(
      inArray(
        marks.id,
        ms.map((m) => m.id),
      ),
    );
  await db
    .insert(markEvents)
    .values(ms.map((m) => ({ studentId: m.studentId, markId: m.id, kind: 'removed' as const, createdAt: at })));
  if (!only) {
    const ls = (await db.select().from(lessons)).filter((l) => l.date >= week[0] && l.date <= week[1]);
    await db
      .update(lessons)
      .set({ removedAt: at })
      .where(
        inArray(
          lessons.id,
          ls.map((l) => l.id),
        ),
      );
  }
  return ms.length;
}

const again = (job: BackgroundJob) => ({ ...job, id: `${job.id}-again` });

describe('restore-false-removals-1', () => {
  beforeEach(() => resetDb(db));

  it('brings back a closed term emptied by the old re-read, keeps a real deletion, adds nothing to the feed', async () => {
    await collectOnce();
    const total = (await db.select().from(marks)).length;
    // a real deletion in September, while the term was current: one mark, its lesson still there
    const [real] = await db.select().from(marks).where(eq(marks.externalId, 'M-6'));
    await oldRemoval(['2025-09-12', '2025-09-12'], new Date('2025-09-20T08:00:00Z'), ['M-6']);
    // November: the re-read of the finished quarter removed both weeks
    const removed = await oldRemoval(['2025-09-08', '2025-09-21'], NOVEMBER);
    expect(removed).toBeGreaterThan(2);

    expect(await runJobs(db, [restoreFalseRemovals as BackgroundJob])).toEqual(['restore-false-removals-1']);
    const active = await db.select().from(marks).where(isNull(marks.removedAt));
    expect(active).toHaveLength(total - 1);
    expect(await db.select().from(marks).where(isNotNull(marks.removedAt))).toEqual([
      expect.objectContaining({ id: real!.id }),
    ]);
    expect(await db.select().from(lessons).where(isNotNull(lessons.removedAt))).toEqual([]);
    // the false events are gone, the real one stays, and no 'restored' event reaches the feed
    const events = await db
      .select()
      .from(markEvents)
      .where(inArray(markEvents.kind, ['removed', 'restored']));
    expect(events).toEqual([expect.objectContaining({ markId: real!.id, kind: 'removed' })]);

    // idempotent: the same step again changes nothing
    await runJobs(db, [again(restoreFalseRemovals as BackgroundJob)]);
    expect(await db.select().from(marks).where(isNull(marks.removedAt))).toHaveLength(total - 1);
    expect(
      await db
        .select()
        .from(markEvents)
        .where(inArray(markEvents.kind, ['removed', 'restored'])),
    ).toHaveLength(1);
  });

  it('a batch the guard would have held in the current term comes back too', async () => {
    await collectOnce();
    const ms = (await db.select().from(marks).where(isNull(marks.removedAt))).filter(
      (m) => m.date >= '2025-09-08' && m.date <= '2025-09-14',
    );
    expect(ms.length).toBeGreaterThan(2);
    // still September (the term is current): three marks gone at the same moment, lessons kept
    await oldRemoval(
      ['2025-09-08', '2025-09-14'],
      new Date('2025-09-20T08:00:00Z'),
      ms.slice(0, 3).map((m) => m.externalId),
    );
    await runJobs(db, [restoreFalseRemovals as BackgroundJob]);
    expect(await db.select().from(marks).where(isNotNull(marks.removedAt))).toEqual([]);
  });
});

describe('remap-stored-finals-1', () => {
  beforeEach(() => resetDb(db));

  it('maps a stored final-marks response again with the fixed mapping', async () => {
    // a fictional provider whose fixed mapping reads a final by the term's label
    const fixed = remapStoredFinalsWith(() => ({
      mapStoredFinals: (stored, known) => {
        if (stored.endpoint !== 'GET /finals') return null;
        const body = stored.body as { marks: Record<string, Record<string, { mark: string }>> };
        return Object.entries(body.marks).flatMap(([subject, periods]) =>
          Object.entries(periods).map(([period, cell]) => ({
            subjectExternalId: subject,
            subjectName: known.subjects.find((x) => x.externalId === subject)?.name ?? subject,
            termExternalId: known.terms.find((t) => t.label === period)?.externalId ?? null,
            raw: cell.mark,
            value: Number(cell.mark),
            kind: 'numeric' as const,
            role: 'final' as const,
          })),
        );
      },
    }));
    const [s] = await db
      .insert(students)
      .values({ providerId: 'demo-full', externalId: 'st-1', fullName: 'Example Pupil' })
      .returning();
    const [y] = await db
      .insert(schoolYears)
      .values({
        studentId: s!.id,
        providerId: 'demo-full',
        externalId: '2026-2027',
        label: '2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-05-31',
      })
      .returning();
    const [q1] = await db
      .insert(terms)
      .values({
        schoolYearId: y!.id,
        externalId: 'ta-1',
        kind: 'quarter',
        index: 1,
        label: 'FIRST_QUARTER',
        startDate: '2026-09-01',
        endDate: '2026-10-31',
      })
      .returning();
    await db.insert(subjects).values({
      studentId: s!.id,
      schoolYearId: y!.id,
      providerId: 'demo-full',
      externalId: 'subj-1',
      name: 'Алгебра',
      nameNorm: 'алгебра',
    });
    await db.insert(finalMarksRaw).values({
      studentId: s!.id,
      schoolYearId: y!.id,
      fetchedAt: NOVEMBER,
      rawJson: {
        endpoint: 'GET /finals',
        body: { marks: { 'subj-1': { FIRST_QUARTER: { mark: '8' } } } },
      },
    });
    await runJobs(db, [fixed as BackgroundJob]);
    expect(await db.select().from(finalMarks)).toEqual([
      expect.objectContaining({ periodId: q1!.id, raw: '8', mark: 8, source: 'api' }),
    ]);
    // the fetch time stays: the next run still reads the finals once that day
    expect((await db.select().from(finalMarksRaw))[0]!.fetchedAt).toEqual(NOVEMBER);
  });
});
