import { and, asc, eq, gt } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, testApp } from '../../test/app';
import { resetDb, testDb } from '../../test/db';
import {
  families,
  homeworkItems,
  lessonPrepEvents,
  lessons,
  lessonTagHits,
  lessonTags,
  marks,
  memberships,
  users,
} from '../db/schema';
import { DEMO_LOGINS, DEMO_PASSWORD, demoStudents, seedDemo } from '../seed/seed';
import { fromLocal } from '../sync/time';

const db = testDb();
// Thursday 15 October 2026, 19:12 in the demo's time zone: today's lessons are over, Friday's are ahead
const NOW = new Date('2026-10-15T16:12:00Z');
const TODAY = '2026-10-15';

type Agent = ReturnType<typeof request.agent>;
type ScheduleLesson = {
  id: string;
  ready: { by: { name: string | null; otherFamily: boolean } | null } | null;
  cancelled: boolean;
  ownHomework: { id: string; text: string }[];
  notes: { facts: { since: number; last: unknown[] } | null; signal: unknown; hint: unknown } | null;
  tags: { tag: { name: string } }[];
  setHere: { dueDate: string }[];
  isTest: boolean;
};

async function signIn(login: string, now = NOW): Promise<Agent> {
  const agent = request.agent(testApp({ now: () => now }));
  expect((await agent.post('/api/auth/login').send({ login, password: DEMO_PASSWORD })).status).toBe(200);
  return agent;
}

const dayOf = async (agent: Agent, studentId: string, date: string) => {
  const res = await agent.get(`/api/students/${studentId}/schedule?day=${date}`);
  expect(res.status).toBe(200);
  return res.body as {
    days: { lessons: ScheduleLesson[] }[];
    attention: { lessonId: string; tag: { name: string } }[];
  };
};
const lessonIn = async (agent: Agent, studentId: string, date: string, id: string) =>
  (await dayOf(agent, studentId, date)).days.flatMap((d) => d.lessons).find((l) => l.id === id)!;

describe('the lesson menu: «готово», «Урока не будет», own homework', () => {
  let milena: { id: string };
  let mark: { id: string };
  /** the first lesson of Milena's next school day, still ahead at NOW */
  let next: typeof lessons.$inferSelect | undefined;
  /** a lesson of today, over at NOW */
  let past: typeof lessons.$inferSelect | undefined;

  beforeEach(async () => {
    await resetDb(db);
    await seedDemo(db, { now: NOW });
    const kids = await demoStudents(db);
    milena = kids.find((k) => k.grade === 7)!;
    mark = kids.find((k) => k.grade === 1)!;
    [next] = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.studentId, milena.id), gt(lessons.date, TODAY)))
      .orderBy(asc(lessons.date), asc(lessons.slot))
      .limit(1);
    [past] = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.studentId, milena.id), eq(lessons.date, TODAY)))
      .limit(1);
  });
  afterEach(settle);

  it('«готово»: who and when, the history kept, ticking twice keeps the first tick', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const url = `/api/students/${milena.id}/lessons/${next!.id}/prep`;
    const put = await mama.put(url);
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ done: true, doneBy: { name: 'Мама', otherFamily: false } });
    const kid = await signIn(DEMO_LOGINS.student);
    expect((await kid.put(url)).body.doneBy).toEqual({ name: 'Мама', otherFamily: false });
    expect((await lessonIn(kid, milena.id, next!.date, next!.id)).ready).not.toBeNull();
    expect((await kid.delete(url)).body).toEqual({ done: false, doneAt: null, doneBy: null });
    expect((await lessonIn(mama, milena.id, next!.date, next!.id)).ready).toBeNull();
    const events = await db.select().from(lessonPrepEvents).where(eq(lessonPrepEvents.lessonId, next!.id));
    expect(events.map((e) => e.kind).sort()).toEqual(['done', 'undone']);
  });

  it('a lesson that has passed takes no action: a minute before its end it does, a minute after it does not', async () => {
    const tz = (await (await signIn(DEMO_LOGINS.parent)).get(`/api/students/${milena.id}/school`)).body.timezone;
    const [h, m] = next!.endTime!.split(':').map(Number);
    const end = h! * 60 + m!;
    const before = await signIn(DEMO_LOGINS.parent, fromLocal(next!.date, end - 1, tz));
    const after = await signIn(DEMO_LOGINS.parent, fromLocal(next!.date, end + 1, tz));
    const url = `/api/students/${milena.id}/lessons/${next!.id}/prep`;
    expect((await before.put(url)).status).toBe(200);
    expect((await lessonIn(before, milena.id, next!.date, next!.id)).notes).not.toBeNull();
    const refused = await after.delete(url);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('lesson_passed');
    // a passed lesson keeps only its mark: no пометки to prepare
    expect((await lessonIn(after, milena.id, next!.date, next!.id)).notes).toBeNull();
    for (const path of ['prep', 'cancel', 'homework']) {
      const res =
        path === 'homework'
          ? await after.post(`/api/students/${milena.id}/lessons/${past!.id}/homework`).send({ text: 'Параграф 5' })
          : await after.put(`/api/students/${milena.id}/lessons/${past!.id}/${path}`);
      expect(res.status, path).toBe(409);
    }
  });

  it('«Урока не будет»: out of the counts, back with «Вернуть урок»; the diary wins once it records the lesson', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const url = `/api/students/${milena.id}/lessons/${next!.id}/cancel`;
    const held = async () =>
      ((await mama.get(`/api/students/${milena.id}/schedule/days`)).body.days as { date: string; held: number }[]).find(
        (d) => d.date === next!.date,
      )!.held;
    const before = await held();
    expect((await mama.put(url)).body).toMatchObject({ cancelled: true });
    expect((await lessonIn(mama, milena.id, next!.date, next!.id)).cancelled).toBe(true);
    expect(await held()).toBe(before - 1);
    expect((await mama.delete(url)).body).toEqual({ cancelled: false, setAt: null });
    expect((await lessonIn(mama, milena.id, next!.date, next!.id)).cancelled).toBe(false);

    // a mark for the lesson: the family cannot cancel it, and a cancellation made before gives way
    await mama.put(url);
    await db.insert(marks).values({
      studentId: milena.id,
      providerId: 'demo-full',
      externalId: 'test-mark-ahead',
      date: next!.date,
      subjectId: next!.subjectId,
      lessonId: next!.id,
      raw: '8',
      kind: 'numeric',
      values: [8],
    });
    expect((await lessonIn(mama, milena.id, next!.date, next!.id)).cancelled).toBe(false);
    const refused = await mama.put(url);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('diary_has_lesson');
  });

  it('own homework: one per lesson, edited and removed by the family; the diary’s homework is read-only', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const base = `/api/students/${milena.id}`;
    expect((await mama.post(`${base}/lessons/${next!.id}/homework`).send({ text: '  ' })).status).toBe(400);
    const added = await mama.post(`${base}/lessons/${next!.id}/homework`).send({ text: 'Параграф 12, номера 3–5' });
    expect(added.status).toBe(200);
    expect((await mama.post(`${base}/lessons/${next!.id}/homework`).send({ text: 'Ещё' })).status).toBe(409);
    const kid = await signIn(DEMO_LOGINS.student);
    expect((await kid.patch(`${base}/homework/${added.body.id}`).send({ text: 'Параграф 13' })).body.text).toBe(
      'Параграф 13',
    );
    expect((await lessonIn(mama, milena.id, next!.date, next!.id)).ownHomework).toEqual([
      // the student edited it; the author stays the parent who added it
      expect.objectContaining({ id: added.body.id, text: 'Параграф 13', by: { name: 'Мама', otherFamily: false } }),
    ]);
    expect((await mama.delete(`${base}/homework/${added.body.id}`)).body).toEqual({ removed: true });
    expect((await lessonIn(mama, milena.id, next!.date, next!.id)).ownHomework).toEqual([]);
    expect((await mama.delete(`${base}/homework/${added.body.id}`)).status).toBe(404);

    const [diary] = await db
      .insert(homeworkItems)
      .values({
        studentId: milena.id,
        providerId: 'demo-full',
        externalId: 'hw-1',
        lessonId: next!.id,
        title: 'Из дневника',
        source: 'diary',
      })
      .returning();
    expect((await mama.patch(`${base}/homework/${diary!.id}`).send({ text: 'Иначе' })).status).toBe(404);
    expect((await mama.delete(`${base}/homework/${diary!.id}`)).status).toBe(404);
  });

  it('only the child’s own people: another family, another child and no session get nothing', async () => {
    const papa = await signIn(DEMO_LOGINS.otherParent);
    const kid = await signIn(DEMO_LOGINS.student);
    const milenaUrl = `/api/students/${milena.id}/lessons/${next!.id}/prep`;
    expect((await papa.put(milenaUrl)).status).toBe(404);
    expect((await request(testApp({ now: () => NOW })).put(milenaUrl)).status).toBe(401);
    // a lesson of another child under this child's id
    const [marksLesson] = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.studentId, mark.id), gt(lessons.date, TODAY)))
      .limit(1);
    const mama = await signIn(DEMO_LOGINS.parent);
    expect((await mama.put(`/api/students/${milena.id}/lessons/${marksLesson!.id}/prep`)).status).toBe(404);
    // the student is Milena: her brother is not hers to tick
    expect((await kid.put(`/api/students/${mark.id}/lessons/${marksLesson!.id}/prep`)).status).toBe(404);
    // Марк is followed by both families: a tick from the other family names nobody to this one
    expect((await papa.put(`/api/students/${mark.id}/lessons/${marksLesson!.id}/prep`)).status).toBe(200);
    expect((await lessonIn(mama, mark.id, marksLesson!.date, marksLesson!.id)).ready!.by).toEqual({
      name: null,
      otherFamily: true,
    });
  });
});

describe('Расписание: пометки, tags and the navigator’s days', () => {
  let milena: { id: string };
  let mark: { id: string };
  let next: typeof lessons.$inferSelect | undefined;

  beforeEach(async () => {
    await resetDb(db);
    await seedDemo(db, { now: NOW });
    const kids = await demoStudents(db);
    milena = kids.find((k) => k.grade === 7)!;
    mark = kids.find((k) => k.grade === 1)!;
    [next] = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.studentId, milena.id), gt(lessons.date, TODAY)))
      .orderBy(asc(lessons.date), asc(lessons.slot))
      .limit(1);
  });
  afterEach(settle);

  it('upcoming lessons carry факты; passed ones none; guidance off drops сигнал and подсказка, keeps the facts', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const ahead = (await dayOf(mama, milena.id, next!.date)).days[0]!.lessons;
    expect(ahead.every((l) => l.notes !== null)).toBe(true);
    const withFacts = ahead.filter((l) => l.notes!.facts);
    expect(withFacts.length).toBeGreaterThan(0);
    expect(withFacts.every((l) => l.notes!.facts!.last.length <= 5)).toBe(true);
    const today = (await dayOf(mama, milena.id, TODAY)).days[0]!.lessons;
    expect(today.every((l) => l.notes === null)).toBe(true);

    const [fam] = await db
      .select({ id: memberships.familyId })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(users.login, DEMO_LOGINS.parent));
    await db
      .update(families)
      .set({ settings: { guidance: false } })
      .where(eq(families.id, fam!.id));
    const off = (await dayOf(mama, milena.id, next!.date)).days[0]!.lessons;
    expect(off.every((l) => l.notes!.signal === null && l.notes!.hint === null)).toBe(true);
    expect(off.filter((l) => l.notes!.facts).length).toBe(withFacts.length);
    // a class without marks has no facts to show
    const markDay = (await mama.get(`/api/students/${mark.id}/schedule?day=next`)).body.days[0]
      .lessons as ScheduleLesson[];
    expect(markDay.every((l) => l.notes === null)).toBe(true);
  });

  it('tag hits: the тег note, «задали», «Контрольная» as a test and «Обратить внимание»; only this family’s tags', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const [test] = await db.select().from(lessonTags).where(eq(lessonTags.presetKey, 'test'));
    const [setAt] = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.studentId, milena.id), eq(lessons.subjectId, next!.subjectId), eq(lessons.date, TODAY)))
      .limit(1);
    await db.insert(lessonTagHits).values({
      familyId: test!.familyId,
      studentId: milena.id,
      tagId: test!.id,
      sourceLessonId: setAt?.id ?? null,
      dueLessonId: next!.id,
      dueDate: next!.date,
      field: 'homework',
      snippet: 'К/р №2 по теме «Системы уравнений»',
    });
    const day = await dayOf(mama, milena.id, next!.date);
    const lesson = day.days[0]!.lessons.find((l) => l.id === next!.id)!;
    expect(lesson.isTest).toBe(true);
    expect(lesson.tags.map((t) => t.tag.name)).toEqual(['Контрольная']);
    expect(day.attention).toEqual([
      expect.objectContaining({ lessonId: next!.id, tag: expect.objectContaining({ name: 'Контрольная' }) }),
    ]);
    if (setAt) {
      const source = (await dayOf(mama, milena.id, TODAY)).days[0]!.lessons.find((l) => l.id === setAt.id)!;
      expect(source.setHere).toEqual([expect.objectContaining({ dueDate: next!.date })]);
    }
    // once cancelled, the lesson leaves «Обратить внимание»
    await mama.put(`/api/students/${milena.id}/lessons/${next!.id}/cancel`);
    expect((await dayOf(mama, milena.id, next!.date)).attention).toEqual([]);

    // the other family's tag on Марк, the shared child, never reaches this family
    const [otherFamily] = await db
      .select({ id: memberships.familyId })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(users.login, DEMO_LOGINS.otherParent));
    const [theirs] = await db
      .insert(lessonTags)
      .values({ familyId: otherFamily!.id, name: 'Принести', keywords: ['принести'] })
      .returning();
    const [marksNext] = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.studentId, mark.id), gt(lessons.date, TODAY)))
      .orderBy(asc(lessons.date))
      .limit(1);
    await db.insert(lessonTagHits).values({
      familyId: otherFamily!.id,
      studentId: mark.id,
      tagId: theirs!.id,
      dueLessonId: marksNext!.id,
      dueDate: marksNext!.date,
      field: 'homework',
      snippet: 'Принести клей',
    });
    const ours = await dayOf(mama, mark.id, marksNext!.date);
    expect(JSON.stringify(ours)).not.toContain('Принести клей');
    const papa = await signIn(DEMO_LOGINS.otherParent);
    expect((await dayOf(papa, mark.id, marksNext!.date)).attention.map((a) => a.tag.name)).toEqual(['Принести']);
  });

  it('the navigator’s days: every day with lessons this school year, today included', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    // a day that is not a date is a bad request, never a database error
    expect((await mama.get(`/api/students/${milena.id}/schedule?day=2026-02-30`)).status).toBe(400);
    const res = await mama.get(`/api/students/${milena.id}/schedule/days`);
    expect(res.status).toBe(200);
    expect(res.body.today).toBe(TODAY);
    expect(res.body.weekStart).toEqual(expect.any(Number));
    // Неделя: every school day of the manifest's calendar is a day of its own, with lessons or without
    const week = await mama.get(`/api/students/${milena.id}/schedule?week=0`);
    const shown = (week.body.days as { date: string }[]).map((d) => new Date(`${d.date}T12:00:00Z`).getUTCDay());
    for (const wd of res.body.schoolDays as number[]) expect(shown).toContain(wd);
    const days = res.body.days as { date: string; lessons: number; held: number }[];
    expect(days.length).toBeGreaterThan(20);
    expect(days.map((d) => d.date)).toEqual([...days.map((d) => d.date)].sort());
    expect(days.some((d) => d.date > TODAY)).toBe(true);
    expect(days.every((d) => d.held <= d.lessons && d.lessons > 0)).toBe(true);
    expect((await (await signIn(DEMO_LOGINS.otherParent)).get(`/api/students/${milena.id}/schedule/days`)).status).toBe(
      404,
    );
  });
});
