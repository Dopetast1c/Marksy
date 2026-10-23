import { DEMO_FULL_FIXTURES } from '@marksy/registry';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { createAccount, DEMO_CREDENTIALS } from '../../test/factories';
import { bellSchedules, lessons, students, subjects, syncRuns, weekTemplates } from '../db/schema';
import type { WeekTemplateEntry } from '../db/schema';
import { getProvider, demoFullTransport } from '@marksy/registry';
import { runCollector } from './collector';
import { matchEntry } from './details';

const db = testDb();

// The fictional regular week of one child: English in the second subgroup on Tuesday, lesson 2, room 412
const ENTRIES: WeekTemplateEntry[] = [
  {
    cycle_week: 1,
    weekday: 2,
    slot: 2,
    subject_id: 'eng',
    group_label: '2-я подгруппа',
    room: '412',
    teacher_name: 'Учитель А',
    template_ref: 'T-ENG-2',
  },
  {
    cycle_week: 1,
    weekday: 1,
    slot: 1,
    subject_id: 'alg',
    room: '305',
    teacher_name: 'Учитель Б',
    template_ref: 'T-ALG',
  },
];

describe('matching a lesson to the regular week (docs/providers.md 4)', () => {
  it('weekday, slot and templateRef: room, subgroup and teacher', () => {
    expect(matchEntry({ date: '2025-09-16', slot: 2, subjectId: 'eng', templateRef: 'T-ENG-2' }, ENTRIES)).toEqual({
      room: '412',
      group: '2-я подгруппа',
      teacherName: 'Учитель А',
      teacherExternalId: undefined,
    });
  });

  it("a moved lesson (same templateRef, another slot): subgroup and teacher, never the other slot's room", () => {
    const m = matchEntry({ date: '2025-09-18', slot: 5, subjectId: 'eng', templateRef: 'T-ENG-2' }, ENTRIES);
    expect(m.room).toBeUndefined();
    expect(m).toMatchObject({ group: '2-я подгруппа', teacherName: 'Учитель А' });
  });

  it('no templateRef in the system: weekday, slot and subject give room and subgroup, no teacher', () => {
    expect(matchEntry({ date: '2025-09-16', slot: 2, subjectId: 'eng', templateRef: null }, ENTRIES)).toEqual({
      room: '412',
      group: '2-я подгруппа',
    });
  });

  it("nothing matches: nothing, rather than another lesson's room", () => {
    expect(matchEntry({ date: '2025-09-16', slot: 3, subjectId: 'eng', templateRef: null }, ENTRIES)).toEqual({});
    expect(matchEntry({ date: '2025-09-16', slot: 2, subjectId: 'eng', templateRef: 'T-UNKNOWN' }, ENTRIES)).toEqual(
      {},
    );
  });
});

describe('school details in a run', () => {
  beforeEach(() => resetDb(db));

  async function collect(accountId: { id: string; familyId: string; providerId: string }, now: Date) {
    const [run] = await db
      .insert(syncRuns)
      .values({
        familyId: accountId.familyId,
        diaryAccountId: accountId.id,
        providerId: 'demo-full',
        kind: 'manual',
        trigger: 'cli',
        startedAt: now,
        status: 'running',
      })
      .returning();
    return runCollector({
      db,
      provider: getProvider('demo-full')!,
      account: accountId,
      credentials: DEMO_CREDENTIALS,
      runId: run!.id,
      plan: () => [
        { weekStart: '2025-09-15', set: 'standing' },
        { weekStart: '2025-09-08', set: 'standing' },
      ],
      transport: demoFullTransport(),
      sleep: async () => undefined,
      now: () => now,
    });
  }

  it('stores bells and the regular week once a day and fills the lessons from them', async () => {
    const { account } = await createAccount(db, 'demo-full');
    await collect(account, new Date('2025-09-19T09:00:00Z'));
    const [p1] = await db.select().from(students).where(eq(students.externalId, 'p-1'));
    expect(await db.select().from(bellSchedules).where(eq(bellSchedules.studentId, p1!.id))).toHaveLength(1);
    const [week] = await db.select().from(weekTemplates).where(eq(weekTemplates.studentId, p1!.id));
    expect(week!.entries).toHaveLength(7);
    const [english] = await db.select().from(subjects).where(eq(subjects.externalId, 'eng'));
    expect(english).toMatchObject({ groupLabel: '2-я подгруппа', level: 'advanced', lessonsPerWeek: 1 });
    // the Tuesday English lesson: its room, subgroup and teacher from the regular week, its end from the bells
    const [lesson] = await db.select().from(lessons).where(eq(lessons.externalId, 'L-104'));
    expect(lesson).toMatchObject({
      room: '412',
      groupLabel: '2-я подгруппа',
      teacherName: 'Климович Елена Сергеевна',
      endTime: '09:40',
    });
    // the grade 1 pupil has bells of his own
    const [p2] = await db.select().from(students).where(eq(students.externalId, 'p-2'));
    const [bells2] = await db.select().from(bellSchedules).where(eq(bellSchedules.studentId, p2!.id));
    expect(bells2!.label).toBe('1-е классы');
  });

  it('a later run the same day reads no details again and keeps them', async () => {
    const { account } = await createAccount(db, 'demo-full');
    const first = await collect(account, new Date('2025-09-19T09:00:00Z'));
    const second = await collect(account, new Date('2025-09-19T11:00:00Z'));
    // 3 requests per pupil (bells, regular week, subjects again) only in the first run
    expect(first.requests - second.requests).toBe(6 + 2);
    const [english] = await db.select().from(subjects).where(eq(subjects.externalId, 'eng'));
    expect(english!.groupLabel).toBe('2-я подгруппа');
    expect(DEMO_FULL_FIXTURES['bells-1']).toBeDefined();
  });
});
