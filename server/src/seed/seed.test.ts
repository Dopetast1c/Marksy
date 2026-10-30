import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, testApp } from '../../test/app';
import { resetDb, testDb } from '../../test/db';
import { verifyPassword } from '../auth/password';
import {
  apiDriftEvents,
  attendance,
  bellSchedules,
  diaryAccounts,
  families,
  familyStudents,
  finalMarks,
  lessons,
  lessonTags,
  marks,
  memberships,
  notifications,
  schoolYears,
  students,
  studentSources,
  studySessions,
  syncCoverage,
  syncRuns,
  users,
} from '../db/schema';
import { generateGrade7, seedCalendar } from '@marksy/demo-diary';
import { DEMO_LOGINS, DEMO_PASSWORD, demoStudents, seedAllowed, seedDemo } from './seed';

const db = testDb();
const NOW = new Date('2026-10-15T16:12:00Z'); // Thursday 15 October 2026, 19:12 in the demo's time zone
const MON_SAT = [1, 2, 3, 4, 5, 6];

describe('seed generator', () => {
  it('is deterministic and dated around today', () => {
    const cal = seedCalendar('2026-10-15', MON_SAT, 7);
    expect(cal.year).toEqual({ label: '2026-2027', start: '2026-09-01', end: '2027-05-31' });
    const a = generateGrade7('2026-10-15', cal);
    expect(generateGrade7('2026-10-15', cal)).toEqual(a);
    expect(a.marks.every((m) => m.date <= '2026-10-15')).toBe(true);
    expect(a.lessons.some((l) => l.date > '2026-10-15')).toBe(true);
    expect(a.marks.filter((m) => m.date === '2026-10-15').length).toBeGreaterThan(0);
    // tests ahead are written in the topic only, so the family's test tag is what finds them
    const next = a.lessons.find((l) => l.subject === 'Алгебра' && l.date > '2026-10-15')!;
    expect(next.topic).toMatch(/^К\/р №2/);
    expect(next.lessonType).toBeNull();
    // English has had no mark for two weeks
    expect(a.marks.filter((m) => m.subject === 'Английский язык' && m.date > '2026-10-01')).toEqual([]);
  });

  it('in summer the demo shows the year that just ended', () => {
    expect(seedCalendar('2027-07-10', MON_SAT, 7).year.label).toBe('2026-2027');
  });
});

describe('pnpm db:seed', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  it('runs only where nobody outside the home can sign in with the demo password', () => {
    for (const ok of [
      undefined,
      '',
      'http://localhost:5173',
      'http://192.168.1.20:5173',
      'http://10.0.0.5',
      'http://nas.local',
    ]) {
      expect(seedAllowed(ok), String(ok)).toBe(true);
    }
    for (const no of ['https://marks.example.com', 'http://172.32.0.1', 'http://8.8.8.8', 'not a url']) {
      expect(seedAllowed(no), no).toBe(false);
    }
  });

  it('runs on an empty database: two children, one without marks, demo logins', async () => {
    const r = await seedDemo(db, { now: NOW });
    expect(r.created).toBe(true);
    const kids = await demoStudents(db);
    expect(kids.map((k) => [k.classLabel, k.gradingScaleId]).sort()).toEqual([
      ['1 «Д»', null],
      ['7 «Г»', 'by-10'],
    ]);
    const grade1 = kids.find((k) => k.grade === 1)!;
    expect(await db.select().from(marks).where(eq(marks.studentId, grade1.id))).toEqual([]);
    expect((await db.select().from(lessons).where(eq(lessons.studentId, grade1.id))).length).toBeGreaterThan(50);
    expect((await db.select().from(marks)).length).toBeGreaterThan(100);
    expect((await db.select().from(attendance)).length).toBeGreaterThan(0);
    expect((await db.select().from(studySessions)).length).toBeGreaterThan(10);
    expect((await db.select().from(lessonTags)).map((t) => t.name)).toContain('Контрольная');
    const parent = (await db.select().from(users).where(eq(users.login, DEMO_LOGINS.parent)))[0]!;
    expect((await db.select().from(memberships).where(eq(memberships.userId, parent.id)))[0]!.role).toBe('admin');
    expect(await verifyPassword(parent.passwordHash, DEMO_PASSWORD)).toBe(true);
  });

  it('matches the prototype: per-child schools, bells, subgroups and rooms; Mark followed by a second family', async () => {
    const r = await seedDemo(db, { now: NOW });
    const kids = await demoStudents(db);
    const milena = kids.find((k) => k.grade === 7)!;
    const mark = kids.find((k) => k.grade === 1)!;
    expect([milena.providerId, mark.providerId]).toEqual(['demo-full', 'demo-lite']);
    expect(milena.schoolLabel).not.toBe(mark.schoolLabel);
    // each child's own bells
    const bells = await db.select().from(bellSchedules);
    expect(bells.map((b) => b.label).sort()).toEqual(['1 смена', '1-е классы']);
    // Milena's English: her subgroup, room and teacher; Mark's thinner diary has no rooms or subgroups
    const [english] = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.studentId, milena.id), eq(lessons.subjectName, 'Английский язык')))
      .limit(1);
    expect(english).toMatchObject({ room: '412', groupLabel: '2-я подгруппа' });
    expect(english!.endTime).toMatch(/^\d{2}:\d{2}$/);
    const markLessons = await db.select().from(lessons).where(eq(lessons.studentId, mark.id));
    expect(markLessons.every((l) => l.room === null && l.groupLabel === null)).toBe(true);
    expect(markLessons.some((l) => l.teacherName)).toBe(true);
    // a second household follows Mark only, and the first family was told once
    const links = await db.select().from(familyStudents).where(eq(familyStudents.studentId, mark.id));
    expect(links).toHaveLength(2);
    expect(await db.select().from(familyStudents).where(eq(familyStudents.studentId, milena.id))).toHaveLength(1);
    const notes = await db.select().from(notifications);
    expect(notes.map((n) => n.title)).toEqual(['notification.childFollowed.title']);
    expect(r.familyId).toBeDefined();
  });

  it('the demo diaries: a run log, verified weeks and a drift notice, no credentials, never read', async () => {
    await seedDemo(db, { now: NOW });
    const accounts = await db.select().from(diaryAccounts);
    expect(accounts.map((a) => [a.providerId, a.label, a.credentialsEnc]).sort()).toEqual([
      ['demo-full', 'a.petrov', null],
      ['demo-lite', 'andrey.p', null],
    ]);
    // each child is read through the own family's login
    const sources = await db.select().from(studentSources).where(eq(studentSources.active, true));
    expect(sources).toHaveLength(2);
    const runs = await db.select().from(syncRuns);
    expect(runs.every((r) => r.startedAt <= NOW)).toBe(true);
    expect(runs.map((r) => r.status)).toEqual(expect.arrayContaining(['success', 'failed', 'skipped_interval']));
    expect(runs.find((r) => r.status === 'failed')).toMatchObject({ errorClass: 'provider_unavailable' });
    const full = accounts.find((a) => a.providerId === 'demo-full')!;
    expect(full.lastSuccessAt!.getTime()).toBeLessThanOrEqual(NOW.getTime());
    // the plan has stale weeks to take: some of the term's weeks were verified more than six days ago
    const weeks = await db.select().from(syncCoverage);
    expect(weeks.some((w) => NOW.getTime() - w.verifiedAt.getTime() > 6 * 86_400_000)).toBe(true);
    expect(await db.select().from(apiDriftEvents)).toHaveLength(1);

    // the scheduler takes only accounts with credentials; "Refresh now" (sync.refresh) and the re-scan say it is a demo
    const mama = request.agent(testApp({ now: () => NOW }));
    await mama.post('/api/auth/login').send({ login: DEMO_LOGINS.parent, password: DEMO_PASSWORD });
    expect((await mama.post('/api/sync/run').send({ accountId: full.id })).body).toEqual({
      started: false,
      reason: 'demo',
      retryAt: null,
    });
    const rescan = await mama.post('/api/sync/rescan').send({ accountId: full.id, period: 'term' });
    expect(rescan.body).toMatchObject({ started: false, reason: 'demo', weeks: 0 });
    expect(await db.select().from(syncRuns)).toHaveLength(runs.length);
    expect(await db.select().from(syncCoverage)).toHaveLength(weeks.length);
    const status = (await mama.get('/api/sync/status')).body;
    expect(status.accounts.map((a: { status: string }) => a.status)).toEqual(['ok', 'ok']);
    expect(status.accounts.find((a: { id: string }) => a.id === full.id).plan.drift).toHaveLength(1);
  });

  it('a past year typed in from the report card, and a student with a wallpaper', async () => {
    await seedDemo(db, { now: NOW });
    const [typed] = await db.select().from(schoolYears).where(eq(schoolYears.source, 'manual'));
    expect(typed).toMatchObject({ label: '2025-2026', startDate: '2025-09-01' });
    const finals = await db.select().from(finalMarks).where(eq(finalMarks.schoolYearId, typed!.id));
    expect(finals.length).toBeGreaterThan(5);
    expect(finals.every((f) => f.source === 'manual' && f.enteredBy && f.periodId === null)).toBe(true);
    const [student] = await db.select().from(users).where(eq(users.login, DEMO_LOGINS.student));
    expect(student!.settings).toMatchObject({ appearance: { background: 'wallpaper' } });
  });

  it('is safe to re-run, and --reset replaces only the demo family', async () => {
    const [other] = await db.insert(families).values({ name: 'Another family' }).returning();
    const first = await seedDemo(db, { now: NOW });
    expect(await seedDemo(db, { now: NOW })).toMatchObject({ created: false, familyId: first.familyId });
    const marksBefore = (await db.select().from(marks)).length;
    const again = await seedDemo(db, { now: NOW, reset: true });
    expect(again.created).toBe(true);
    expect(again.familyId).not.toBe(first.familyId);
    expect((await db.select().from(marks)).length).toBe(marksBefore);
    // the other family of the real world stays; the two demo families were replaced
    const left = (await db.select().from(families)).map((f) => f.id);
    expect(left).toContain(other!.id);
    expect(left).toContain(again.familyId);
    expect(left).toHaveLength(3);
    expect(await db.select().from(students)).toHaveLength(2);
    // the demo diaries were replaced with their families, the drift notice is still one
    expect(await db.select().from(diaryAccounts)).toHaveLength(2);
    expect(await db.select().from(apiDriftEvents)).toHaveLength(1);
  });
});
