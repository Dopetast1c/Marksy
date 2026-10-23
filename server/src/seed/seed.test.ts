import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { verifyPassword } from '../auth/password';
import { families, lessons, lessonTags, marks, attendance, studySessions, users } from '../db/schema';
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
    // tests ahead are written in the topic only, so the tag «Контрольная» is what finds them
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
    expect(parent.role).toBe('admin');
    expect(await verifyPassword(parent.passwordHash, DEMO_PASSWORD)).toBe(true);
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
    expect((await db.select().from(families)).map((f) => f.id).sort()).toEqual([other!.id, again.familyId].sort());
  });
});
