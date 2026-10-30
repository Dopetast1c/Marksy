import type { Lesson } from '@marksy/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { behaviourEvents, lessonOverrides, lessons, marks, schoolYears, students } from '../db/schema';
import { upsertRange } from './upsert';

const db = testDb();
const T1 = new Date('2026-10-12T10:00:00Z');
const T2 = new Date('2026-10-13T10:00:00Z');
const RANGE = { from: '2026-10-12', to: '2026-10-17' };

/** A fictional lesson; with `remark`, the teacher's comment without a mark on it */
function lesson(remark?: string): Lesson {
  return {
    externalId: 'l-1',
    date: '2026-10-12',
    slot: 2,
    subjectExternalId: 's-1',
    subjectName: 'Математика',
    marks: [],
    ...(remark && {
      behaviour: [
        {
          externalId: 'r-1',
          date: '2026-10-12',
          polarity: 'neutral' as const,
          category: 'lesson_comment',
          comment: remark,
          subjectExternalId: 's-1',
          lessonExternalId: 'l-1',
          authorExternalId: 't-1',
        },
      ],
    }),
  };
}

describe('upsertRange: teacher remarks on lessons', () => {
  beforeEach(() => resetDb(db));

  it('keeps a comment without a mark with its lesson; gone is removed, back is restored; never a mark', async () => {
    const [student] = await db
      .insert(students)
      .values({ providerId: 'demo-full', externalId: 'p-1', fullName: 'Ученик А' })
      .returning();
    const [year] = await db
      .insert(schoolYears)
      .values({
        studentId: student!.id,
        providerId: 'demo-full',
        externalId: 'y',
        label: '2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-05-31',
      })
      .returning();
    const scope = (now: Date) => ({
      studentId: student!.id,
      providerId: 'demo-full',
      schoolYearId: year!.id,
      now,
      subjectIds: new Map<string, string>(),
    });
    const fetch = (l: Lesson) => ({ range: RANGE, lessons: [l], marks: [], attendance: [] });

    await upsertRange(db, scope(T1), fetch(lesson('Нет домашнего задания')));
    const [l] = await db.select().from(lessons);
    const [r] = await db.select().from(behaviourEvents);
    expect(r).toMatchObject({
      lessonId: l!.id,
      comment: 'Нет домашнего задания',
      polarity: 'neutral',
      category: 'lesson_comment',
      authorExternalId: 't-1',
      firstSeenAt: T1,
      removedAt: null,
    });
    expect(r!.subjectId).not.toBeNull();
    expect(await db.select().from(marks)).toEqual([]);

    await upsertRange(db, scope(T2), fetch(lesson()));
    expect((await db.select().from(behaviourEvents))[0]!.removedAt).toEqual(T2);
    // the lesson itself stays
    expect((await db.select().from(lessons))[0]!.removedAt).toBeNull();

    await upsertRange(db, scope(T2), fetch(lesson('Нет домашнего задания, исправлено')));
    const [back] = await db.select().from(behaviourEvents);
    expect(back).toMatchObject({ removedAt: null, comment: 'Нет домашнего задания, исправлено', firstSeenAt: T1 });
  });
});

describe('upsertRange: "Lesson won\'t take place" (lessonMenu.cancel) gives way to the diary', () => {
  beforeEach(() => resetDb(db));

  it('a topic keeps the family’s cancellation; a mark for the lesson removes it', async () => {
    const [student] = await db
      .insert(students)
      .values({ providerId: 'demo-full', externalId: 'p-1', fullName: 'Ученик А' })
      .returning();
    const [year] = await db
      .insert(schoolYears)
      .values({
        studentId: student!.id,
        providerId: 'demo-full',
        externalId: 'y',
        label: '2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-05-31',
      })
      .returning();
    const scope = {
      studentId: student!.id,
      providerId: 'demo-full',
      schoolYearId: year!.id,
      now: T1,
      subjectIds: new Map<string, string>(),
    };
    await upsertRange(db, scope, { range: RANGE, lessons: [lesson()], marks: [], attendance: [] });
    const [l] = await db.select().from(lessons);
    await db.insert(lessonOverrides).values({ studentId: student!.id, lessonId: l!.id, cancelled: true, setAt: T1 });

    // the diary shows a planned topic ahead: the lesson is still cancelled
    await upsertRange(db, scope, {
      range: RANGE,
      lessons: [{ ...lesson(), topic: 'Дроби' }],
      marks: [],
      attendance: [],
    });
    expect(await db.select().from(lessonOverrides)).toHaveLength(1);

    const mark = {
      externalId: 'm-1',
      date: '2026-10-12',
      subjectExternalId: 's-1',
      subjectName: 'Математика',
      lessonExternalId: 'l-1',
      raw: '8',
      kind: 'numeric' as const,
      values: [8],
    };
    await upsertRange(db, scope, {
      range: RANGE,
      lessons: [{ ...lesson(), marks: [mark] }],
      marks: [],
      attendance: [],
    });
    expect(await db.select().from(lessonOverrides)).toEqual([]);
  });
});
