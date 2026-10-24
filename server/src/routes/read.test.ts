import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, testApp } from '../../test/app';
import { resetDb, testDb } from '../../test/db';
import {
  behaviourEvents,
  familyStudents,
  lessonPrep,
  lessons,
  marks,
  schoolYears,
  students,
  subjects,
  syncRuns,
  users,
  userStudentAccess,
} from '../db/schema';
import { diaryAccounts } from '../db/schema';
import { listProviders } from '@marksy/registry';
import { DEMO_LOGINS, DEMO_PASSWORD, demoStudents, seedDemo } from '../seed/seed';
import type { AppDeps } from '../http/context';
import { missedSchoolDay } from './sync';

const db = testDb();
// Thursday 15 October 2026, 19:12 in the demo's time zone (the seed builds its diary around it)
const NOW = new Date('2026-10-15T16:12:00Z');
const app = () => testApp({ now: () => NOW });
/** A provider whose diary has teacher comments (capabilities.behaviour), whichever it is */
const WITH_BEHAVIOUR = listProviders({ all: true }).find((p) => p.manifest.capabilities.behaviour !== 'none')!.manifest
  .id;

async function signIn(login: string) {
  const agent = request.agent(app());
  const res = await agent.post('/api/auth/login').send({ login, password: DEMO_PASSWORD });
  expect(res.status).toBe(200);
  return agent;
}

describe('read API', () => {
  let kids: Awaited<ReturnType<typeof demoStudents>>;
  let milena: (typeof kids)[number];
  let mark: (typeof kids)[number];

  beforeEach(async () => {
    await resetDb(db);
    await seedDemo(db, { now: NOW });
    kids = await demoStudents(db);
    milena = kids.find((k) => k.grade === 7)!;
    mark = kids.find((k) => k.grade === 1)!;
  });
  afterEach(settle);

  it('«С кого начнём?» in one request: a card per child, the school named when the schools differ', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const res = await mama.get('/api/students');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const byId = Object.fromEntries(res.body.map((c: { id: string }) => [c.id, c]));
    expect(byId[milena.id]).toMatchObject({ hasMarks: true, showSchool: true, nextDay: null, nearestTag: null });
    expect(byId[milena.id].week).toHaveProperty('trend');
    // a year without marks: no comparison, the next school day's lessons instead (a weekend shows Monday)
    expect(byId[mark.id]).toMatchObject({ hasMarks: false, week: null });
    const next = byId[mark.id].nextDay;
    expect(next.date > NOW.toISOString().slice(0, 10)).toBe(true);
    expect(next.lessons).toBeGreaterThan(0);
  });

  it('Главная: the comparison and the bands of the child’s scale, the last day, Внимание, the next day', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const res = await mama.get(`/api/students/${milena.id}/overview?period=month`);
    expect(res.status).toBe(200);
    expect(res.body.hasMarks).toBe(true);
    expect(res.body.comparison).toHaveProperty('current');
    expect(res.body.bands.length).toBeGreaterThan(0);
    for (const b of res.body.bands) expect(b.labelKey).toMatch(/^band\./);
    expect(res.body.marksCount).toBeGreaterThan(0);
    expect(res.body.lastDay.marks.length).toBeGreaterThan(0);
    expect(res.body.attention.length).toBeLessThanOrEqual(5);
    expect(res.body.attentionTotal).toBeGreaterThanOrEqual(res.body.attention.length);
    expect(res.body.nextDay.lessons.length).toBeGreaterThan(0);
    // the distribution counts every value of the period once, on the child's scale
    const sum = res.body.distribution.reduce((n: number, b: { count: number }) => n + b.count, 0);
    expect(sum).toBeGreaterThanOrEqual(res.body.marksCount);
    expect(res.body.lessonTiles).toBeNull();
    // the next day's lessons are the timetable's lessons (the compact LessonRow)
    expect(res.body.nextDay.lessons[0]).toHaveProperty('ownHomework');
    const none = await mama.get(`/api/students/${mark.id}/overview?period=month`);
    expect(none.body).toMatchObject({ hasMarks: false, comparison: null, bands: [], distribution: [] });
    expect(none.body.lessonTiles.lessons).toBeGreaterThan(0);
    expect((await mama.get(`/api/students/${milena.id}/overview?period=week&offset=300`)).status).toBe(404);
  });

  it('the last school day with marks does not follow the period; Внимание keeps at most three drops and one rise', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const now = await mama.get(`/api/students/${milena.id}/overview?period=week`);
    const back = await mama.get(`/api/students/${milena.id}/overview?period=week&offset=3`);
    expect(back.body.lastDay.date).toBe(now.body.lastDay.date);
    expect(now.body.lastDay.date <= '2026-10-15').toBe(true);
    expect(now.body.lastDay.marks[0]).toHaveProperty('workType');
    for (const offset of [0, 1, 2, 3]) {
      const ev = await mama.get(`/api/students/${milena.id}/events?period=week&offset=${offset}`);
      const kinds = ev.body.items.map((i: { kind: string }) => i.kind);
      expect(kinds.filter((k: string) => k === 'average_down').length).toBeLessThanOrEqual(3);
      expect(kinds.filter((k: string) => k === 'average_up').length).toBeLessThanOrEqual(1);
    }
  });

  it('the period picker counts marks per instance, or lessons for a class without marks', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const withMarks = await mama.get(`/api/students/${milena.id}/periods`);
    expect(withMarks.body.counts).toBe('marks');
    expect(withMarks.body.instances.year[0].count).toBeGreaterThan(0);
    const weeks = withMarks.body.instances.week.reduce((n: number, i: { count: number }) => n + i.count, 0);
    expect(weeks).toBe(withMarks.body.instances.year[0].count);
    const noMarks = await mama.get(`/api/students/${mark.id}/periods`);
    expect(noMarks.body.counts).toBe('lessons');
    expect(noMarks.body.instances.week[0].count).toBeGreaterThan(0);
  });

  it('«Сейчас» and today are the school’s, whatever timezone the server machine is in', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    // 10:00 at the school on Thursday: a lesson is on
    const morning = new Date('2026-10-15T07:00:00Z');
    const look = () =>
      request(testApp({ now: () => morning }))
        .get(`/api/students/${milena.id}/overview`)
        .set(
          'cookie',
          mama.jar.getCookies({ path: '/', domain: '127.0.0.1', secure: false, script: false }).toValueString(),
        );
    const machineTz = process.env.TZ;
    try {
      const seen = [];
      for (const tz of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
        process.env.TZ = tz;
        const res = await look();
        seen.push(JSON.stringify([res.body.now, res.body.period.from, res.body.lastDay?.date]));
      }
      expect(new Set(seen).size).toBe(1);
      expect(JSON.parse(seen[0]!)[0]).not.toBeNull();
    } finally {
      process.env.TZ = machineTz;
    }
  });

  it('Оценки, Предметы, Предмет: marks by day, subjects with the child’s teacher and group, the regular week', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const feed = await mama.get(`/api/students/${milena.id}/marks?period=year&limit=5`);
    expect(feed.status).toBe(200);
    expect(feed.body.items).toHaveLength(5);
    expect(feed.body.items.every((i: { type: string }) => i.type === 'mark')).toBe(true);
    const page2 = await mama.get(`/api/students/${milena.id}/marks?period=year&limit=5&cursor=${feed.body.next}`);
    expect(page2.body.items[0].id).not.toBe(feed.body.items[0].id);
    // the demo diary has no behaviour: no comments, and the comments filter finds nothing
    expect((await mama.get(`/api/students/${milena.id}/marks?period=year&comments=only`)).body.items).toEqual([]);

    const list = await mama.get(`/api/students/${milena.id}/subjects?period=year&sort=weak`);
    expect(list.body.subjects.length).toBeGreaterThan(3);
    const english = list.body.subjects.find((s: { subject: { name: string } }) => s.subject.name === 'Английский язык');
    expect(english.subject).toMatchObject({ groupLabel: '2-я подгруппа' });
    expect(english.subject.teacherName).toBeTruthy();

    const one = await mama.get(`/api/students/${milena.id}/subjects/${english.subject.id}?period=year`);
    expect(one.status).toBe(200);
    expect(one.body.week.length).toBeGreaterThan(0);
    expect(one.body.week[0]).toMatchObject({ room: expect.any(String), groupLabel: '2-я подгруппа' });
    expect(one.body.terms.length).toBeGreaterThan(0);
    expect(one.body.timeline.every((i: { subject: { id: string } }) => i.subject.id === english.subject.id)).toBe(true);
    const trend = await mama.get(`/api/students/${milena.id}/subjects/${english.subject.id}/trend?period=week`);
    expect(trend.body.buckets.length).toBeGreaterThan(0);
    // a subject of another child is not this child's
    const markSubject = (await db.select().from(subjects).where(eq(subjects.studentId, mark.id)))[0]!;
    expect((await mama.get(`/api/students/${milena.id}/subjects/${markSubject.id}`)).status).toBe(404);
  });

  it('Расписание, Школа, Итоги: rooms, subgroups and end times; bells, terms and holidays; term finals', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const week = await mama.get(`/api/students/${milena.id}/schedule?week=0`);
    expect(week.status).toBe(200);
    const all = week.body.days.flatMap((d: { lessons: unknown[] }) => d.lessons);
    expect(all.length).toBeGreaterThan(10);
    expect(all.some((l: { room: string | null }) => l.room)).toBe(true);
    expect(all.every((l: { end: string | null }) => l.end)).toBe(true);
    expect(all.every((l: { teacherComment: string | null }) => l.teacherComment === null)).toBe(true);
    const school = await mama.get(`/api/students/${milena.id}/school`);
    expect(school.body.bells.length).toBeGreaterThan(0);
    expect(school.body.terms.length).toBeGreaterThan(0);
    const finals = await mama.get(`/api/students/${milena.id}/finals/quarters`);
    expect(finals.body.rows.length).toBeGreaterThan(0);
    expect(finals.body.rows[0].terms.length).toBe(finals.body.terms.length);
    expect((await mama.get(`/api/students/${milena.id}/finals/years`)).status).toBe(200);
    expect((await mama.get(`/api/students/${milena.id}/periods`)).body.kinds).toContain('term');
  });

  it('another family’s data is not reachable; a shared child is, without the other family’s names', async () => {
    const papa = await signIn(DEMO_LOGINS.otherParent);
    expect((await papa.get('/api/students')).body.map((c: { id: string }) => c.id)).toEqual([mark.id]);
    for (const path of ['overview', 'marks', 'subjects', 'schedule?week=0', 'events', 'school', 'finals/quarters'])
      expect((await papa.get(`/api/students/${milena.id}/${path}`)).status, path).toBe(404);
    // Марк is followed by both: a «готово» made by Мама shows her name to her family only
    const [lesson] = await db.select().from(lessons).where(eq(lessons.studentId, mark.id)).limit(1);
    const [mama] = await db.select().from(users).where(eq(users.login, DEMO_LOGINS.parent));
    await db.insert(lessonPrep).values({ studentId: mark.id, lessonId: lesson!.id, doneAt: NOW, doneBy: mama!.id });
    const weekOf = async (agent: Awaited<ReturnType<typeof signIn>>) => {
      const days = (await agent.get(`/api/students/${mark.id}/schedule?week=${weekOffset(lesson!.date)}`)).body.days;
      return days
        .flatMap((d: { lessons: { id: string }[] }) => d.lessons)
        .find((l: { id: string }) => l.id === lesson!.id);
    };
    expect((await weekOf(papa)).ready.by).toEqual({ name: null, otherFamily: true });
    expect((await weekOf(await signIn(DEMO_LOGINS.parent))).ready.by).toEqual({ name: 'Мама', otherFamily: false });
    expect(JSON.stringify((await papa.get(`/api/students/${mark.id}/schedule?week=0`)).body)).not.toContain('Мама');
  });

  it('a suspended link serves nothing; without a session, nothing at all', async () => {
    const mama = await signIn(DEMO_LOGINS.parent);
    const [fs] = await db.select().from(familyStudents).where(eq(familyStudents.studentId, milena.id));
    await db
      .update(familyStudents)
      .set({ status: 'suspended' })
      .where(and(eq(familyStudents.familyId, fs!.familyId), eq(familyStudents.studentId, milena.id)));
    expect((await mama.get(`/api/students/${milena.id}/overview`)).status).toBe(404);
    expect((await mama.get('/api/students')).body.map((c: { id: string }) => c.id)).toEqual([mark.id]);
    const anon = request(app());
    for (const path of [
      '/api/students',
      `/api/students/${mark.id}/overview`,
      `/api/students/${mark.id}/marks`,
      `/api/students/${mark.id}/schedule`,
      '/api/sync/status',
    ])
      expect((await anon.get(path)).status, path).toBe(401);
  });

  it('a student sees themselves only; Синхронизация shows how fresh the data is', async () => {
    const kid = await signIn(DEMO_LOGINS.student);
    expect((await kid.get('/api/students')).body.map((c: { id: string }) => c.id)).toEqual([milena.id]);
    expect((await kid.get(`/api/students/${mark.id}/overview`)).status).toBe(404);
    const status = await kid.get('/api/sync/status');
    expect(status.status).toBe(200);
    expect(status.body.students).toEqual([expect.objectContaining({ id: milena.id })]);
    expect((await kid.get('/api/sync/runs')).status).toBe(403);
  });

  it('«загружаем» while a run of the family’s diary is under way (the first sync after connecting)', async () => {
    const [fs] = await db.select().from(familyStudents).where(eq(familyStudents.studentId, milena.id));
    const [account] = await db
      .insert(diaryAccounts)
      .values({ familyId: fs!.familyId, providerId: 'demo-full', role: 'parent', label: 'diary-user' })
      .returning();
    await db.insert(syncRuns).values({
      familyId: fs!.familyId,
      diaryAccountId: account!.id,
      providerId: 'demo-full',
      kind: 'connect',
      trigger: 'user:x',
      startedAt: NOW,
      status: 'running',
    });
    const mama = await signIn(DEMO_LOGINS.parent);
    const status = (await mama.get('/api/sync/status')).body;
    expect(status.accounts).toEqual([expect.objectContaining({ id: account!.id, status: 'loading' })]);
    const runs = (await mama.get('/api/sync/runs')).body;
    expect(runs[0]).toMatchObject({ kind: 'connect', trigger: 'user' });
  });

  it('stale only when a school day of the child passed unread: a weekend is not an alarm (D22, D55)', async () => {
    const deps = { db } as AppDeps;
    const day = 86_400_000;
    // the last read: Saturday 10 October, 14:00 at the school (the demo school has lessons on Saturdays)
    const saturday = new Date('2026-10-10T11:00:00Z');
    const stale = (now: string) => missedSchoolDay(deps, [milena.id], saturday, new Date(now), 'Europe/Minsk', day);
    expect(await stale('2026-10-12T04:00:00Z')).toBe(false); // Monday 07:00: only Sunday in between
    expect(await stale('2026-10-14T04:00:00Z')).toBe(true); // Wednesday: Monday and Tuesday were not read
    expect(await missedSchoolDay(deps, [milena.id], null, new Date(), 'Europe/Minsk', day)).toBe(true);
    // a child no login reads (the demo family) is not stale: there is nothing to read them through
    const mama = await signIn(DEMO_LOGINS.parent);
    const status = (await mama.get('/api/sync/status')).body;
    expect(
      status.students.every((s: { readThrough: string; stale: boolean }) => s.readThrough !== 'none' || !s.stale),
    ).toBe(true);
  });
});

describe('teacher comments without a mark (D56)', () => {
  beforeEach(async () => {
    await resetDb(db);
    await seedDemo(db, { now: NOW });
  });
  afterEach(settle);

  /** A child on a diary with behaviour, followed by the demo family, with one comment */
  async function childWithComment(daysAgo: number) {
    const [mamaUser] = await db.select().from(users).where(eq(users.login, DEMO_LOGINS.parent));
    const [link] = await db.select().from(familyStudents).limit(1);
    const [s] = await db
      .insert(students)
      .values({ providerId: WITH_BEHAVIOUR, externalId: 'ext-1', fullName: 'Пример Ученица', givenName: 'Ученица' })
      .returning();
    const [year] = await db
      .insert(schoolYears)
      .values({
        studentId: s!.id,
        providerId: WITH_BEHAVIOUR,
        externalId: 'y',
        label: '2026-2027',
        startDate: '2026-09-01',
        endDate: '2027-05-31',
      })
      .returning();
    const [subject] = await db
      .insert(subjects)
      .values({
        studentId: s!.id,
        schoolYearId: year!.id,
        providerId: WITH_BEHAVIOUR,
        externalId: 'sub',
        name: 'Математика',
        nameNorm: 'математика',
      })
      .returning();
    const date = new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
    const [lesson] = await db
      .insert(lessons)
      .values({
        studentId: s!.id,
        providerId: WITH_BEHAVIOUR,
        externalId: 'l-1',
        date,
        slot: 3,
        subjectId: subject!.id,
        subjectName: 'Математика',
      })
      .returning();
    await db.insert(marks).values({
      studentId: s!.id,
      providerId: WITH_BEHAVIOUR,
      externalId: 'm-1',
      date,
      subjectId: subject!.id,
      raw: '8',
      kind: 'numeric',
      values: [8],
    });
    await db.insert(behaviourEvents).values({
      studentId: s!.id,
      providerId: WITH_BEHAVIOUR,
      externalId: 'r-1',
      date,
      polarity: 'neutral',
      category: 'lesson_comment',
      comment: 'Нет домашнего задания',
      subjectId: subject!.id,
      lessonId: lesson!.id,
    });
    await db.insert(familyStudents).values({ familyId: link!.familyId, studentId: s!.id });
    await db.insert(userStudentAccess).values({ userId: mamaUser!.id, familyId: link!.familyId, studentId: s!.id });
    return { id: s!.id, date, lessonId: lesson!.id };
  }

  it('its own row in Оценки (filter only), on the lesson in Расписание, a fact in Внимание for 7 days; never a mark', async () => {
    const kid = await childWithComment(1);
    const mama = await signIn(DEMO_LOGINS.parent);
    const feed = (await mama.get(`/api/students/${kid.id}/marks?period=month`)).body.items;
    expect(feed.map((i: { type: string }) => i.type)).toEqual(['mark', 'comment']);
    const only = (await mama.get(`/api/students/${kid.id}/marks?period=month&comments=only`)).body.items;
    expect(only).toEqual([expect.objectContaining({ type: 'comment', text: 'Нет домашнего задания', slot: 3 })]);
    const overview = (await mama.get(`/api/students/${kid.id}/overview?period=month`)).body;
    expect(overview.marksCount).toBe(1);
    expect(overview.attention.map((e: { kind: string }) => e.kind)).toContain('teacher_comment');
    const comment = overview.attention.find((e: { kind: string }) => e.kind === 'teacher_comment');
    expect(comment).toMatchObject({ severity: 'neutral', link: { screen: 'schedule', lessonId: kid.lessonId } });
    const days = (await mama.get(`/api/students/${kid.id}/schedule?week=${weekOffset(kid.date)}`)).body.days;
    const l = days
      .flatMap((d: { lessons: { id: string }[] }) => d.lessons)
      .find((x: { id: string }) => x.id === kid.lessonId);
    expect(l.teacherComment).toBe('Нет домашнего задания');
    // Предметы with the filter Комментарии says how many each subject has, never "no marks"
    const list = (await mama.get(`/api/students/${kid.id}/subjects?period=month&comments=only`)).body.subjects;
    expect(list.map((r: { comments: number | null }) => r.comments).reduce((a: number, b: number) => a + b, 0)).toBe(1);
  });

  it('after 7 days it leaves Внимание and stays in Оценки', async () => {
    const kid = await childWithComment(9);
    const mama = await signIn(DEMO_LOGINS.parent);
    const events = (await mama.get(`/api/students/${kid.id}/events?period=month`)).body.items;
    expect(events.map((e: { kind: string }) => e.kind)).not.toContain('teacher_comment');
    const only = (await mama.get(`/api/students/${kid.id}/marks?period=month&comments=only`)).body.items;
    expect(only).toHaveLength(1);
  });
});

/** The schedule's week offset of a date, from NOW's week (Monday-first in the demo) */
function weekOffset(date: string): number {
  const monday = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x.getTime();
  };
  return Math.round((monday(new Date(`${date}T00:00:00Z`)) - monday(NOW)) / (7 * 86_400_000));
}
