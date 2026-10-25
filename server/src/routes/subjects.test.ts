import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { settle, testApp } from '../../test/app';
import { resetDb, testDb } from '../../test/db';
import { families, familyStudents, finalMarks, schoolYears, subjects } from '../db/schema';
import { DEMO_LOGINS, DEMO_PASSWORD, demoStudents, seedDemo } from '../seed/seed';

const db = testDb();
// Thursday 15 October 2026, 19:12 in the demo's time zone: the first term runs until 31 October
const IN_TERM = new Date('2026-10-15T16:12:00Z');
// Wednesday 4 November 2026, the autumn holidays: the first term is over and its finals are in
const HOLIDAYS = new Date('2026-11-04T09:00:00Z');

async function setUp(now: Date) {
  await resetDb(db);
  await seedDemo(db, { now });
  const kids = await demoStudents(db);
  const app = testApp({ now: () => now });
  const signIn = async (login: string) => {
    const agent = request.agent(app);
    expect((await agent.post('/api/auth/login').send({ login, password: DEMO_PASSWORD })).status).toBe(200);
    return agent;
  };
  return { milena: kids.find((k) => k.grade === 7)!, mark: kids.find((k) => k.grade === 1)!, signIn };
}

const subjectNamed = async (studentId: string, name: string) =>
  (
    await db
      .select()
      .from(subjects)
      .where(and(eq(subjects.studentId, studentId), eq(subjects.name, name)))
  )[0]!;

type Row = { subject: { id: string; name: string; color: string | null }; count: number; final: unknown };

describe('Предметы and Предмет', () => {
  afterEach(settle);

  it('every subject is listed; the comments filter and a tag filter leave no marks, never fewer rows', async () => {
    const { milena, signIn } = await setUp(IN_TERM);
    const mama = await signIn(DEMO_LOGINS.parent);
    const all = (await mama.get(`/api/students/${milena.id}/subjects?period=month`)).body.subjects as Row[];
    expect(all.some((r) => r.count > 0)).toBe(true);
    for (const q of ['comments=only', 'tags=t1&tagMode=all']) {
      const rows = (await mama.get(`/api/students/${milena.id}/subjects?period=month&${q}`)).body.subjects as Row[];
      expect(rows.map((r) => r.subject.id).sort(), q).toEqual(all.map((r) => r.subject.id).sort());
      expect(
        rows.every((r) => r.count === 0),
        q,
      ).toBe(true);
    }
    // the term's finals are not news while the term runs
    expect(all.every((r) => r.final === null)).toBe(true);
    const algebra = await subjectNamed(milena.id, 'Алгебра');
    const one = await mama.get(`/api/students/${milena.id}/subjects/${algebra.id}?period=month&comments=only`);
    expect(one.body).toMatchObject({ count: 0, distribution: expect.any(Array) });
    const trend = await mama.get(`/api/students/${milena.id}/subjects/${algebra.id}/trend?period=week&tags=t1`);
    expect(trend.body.buckets.every((b: { count: number }) => b.count === 0)).toBe(true);
  });

  it('a class without marks: lessons and homework per subject, the next lesson, sorted by it', async () => {
    const { mark, signIn } = await setUp(IN_TERM);
    const mama = await signIn(DEMO_LOGINS.parent);
    const res = await mama.get(`/api/students/${mark.id}/subjects?period=week`);
    expect(res.status).toBe(200);
    const rows = res.body.subjects as { lessons: { count: number; next: { date: string } | null }; comparison: null }[];
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.every((r) => r.comparison === null && r.lessons)).toBe(true);
    expect(rows.some((r) => r.lessons.count > 0)).toBe(true);
    const dates = rows.map((r) => r.lessons.next?.date ?? '~');
    expect(dates).toEqual([...dates].sort());
    const first = rows[0] as unknown as Row;
    const one = await mama.get(`/api/students/${mark.id}/subjects/${first.subject.id}?period=week`);
    expect(one.body.settings).toEqual({ goal: null, goalAvailable: false });
    expect(one.body.lessonTiles.lessons).toBeGreaterThanOrEqual(0);
    expect(one.body.attention).toEqual({ goal: null, hints: [] });
  });

  it('the goal: the scale’s default, a row in «Обратить внимание», «Без цели», only values of the scale', async () => {
    const { milena, mark, signIn } = await setUp(IN_TERM);
    const mama = await signIn(DEMO_LOGINS.parent);
    const algebra = await subjectNamed(milena.id, 'Алгебра');
    const url = `/api/students/${milena.id}/subjects/${algebra.id}`;
    const before = await mama.get(`${url}?period=week`);
    expect(before.body.settings).toEqual({ goal: 8, goalAvailable: true });
    expect(before.body.attention.goal).toMatchObject({ target: 8, need: 7.5, term: { index: 1 } });
    expect(['reached', 'short', 'out_of_reach']).toContain(before.body.attention.goal.state);

    expect((await mama.put(`${url}/goal`).send({ termGoal: 9 })).body).toEqual({ goal: 9 });
    expect((await mama.get(url)).body.attention.goal).toMatchObject({ target: 9, need: 8.5 });
    expect((await mama.put(`${url}/goal`).send({ termGoal: null })).body).toEqual({ goal: null });
    const none = (await mama.get(url)).body;
    expect(none.settings.goal).toBeNull();
    expect(none.attention.goal).toBeNull();
    expect((await mama.put(`${url}/goal`).send({ termGoal: 11 })).status).toBe(400);
    expect((await mama.put(`${url}/goal`).send({ termGoal: 7.5 })).status).toBe(400);
    // a year without marks has no goals
    const markSubject = (await db.select().from(subjects).where(eq(subjects.studentId, mark.id)))[0]!;
    const noGoal = await mama.put(`/api/students/${mark.id}/subjects/${markSubject.id}/goal`).send({ termGoal: 8 });
    expect(noGoal.status).toBe(400);
  });

  it('«Близко к цели» on Главная: subjects one step from their goal with the quickest plan; gone with guidance off', async () => {
    const { milena, mark, signIn } = await setUp(IN_TERM);
    const mama = await signIn(DEMO_LOGINS.parent);
    const rows = (await mama.get(`/api/students/${milena.id}/subjects?period=month`)).body.subjects as Row[];
    // every subject «Без цели» but one, whose goal is set one mark above where its term average stands
    let near: { id: string; target: number; average: number } | null = null;
    for (const r of rows) {
      const url = `/api/students/${milena.id}/subjects/${r.subject.id}`;
      const goal = (await mama.get(url)).body.attention.goal as { average: number | null } | null;
      const a = goal?.average;
      const terms = (await mama.get(`${url}?period=quarter`)).body.count as number;
      if (!near && a != null && a < 9 && terms >= 3) {
        near = { id: r.subject.id, target: Math.round(a) + 1, average: a };
        await mama.put(`${url}/goal`).send({ termGoal: near.target });
      } else await mama.put(`${url}/goal`).send({ termGoal: null });
    }
    expect(near).not.toBeNull();
    const home = (await mama.get(`/api/students/${milena.id}/overview?period=week`)).body;
    expect(home.nearGoals).toEqual([
      {
        subject: expect.objectContaining({ id: near!.id }),
        target: near!.target,
        average: near!.average,
        need: near!.target - 0.5,
        plan: { value: expect.any(Number), count: expect.any(Number) },
      },
    ]);
    expect(home.nearGoals[0].plan.value).toBeGreaterThan(near!.target - 0.5);
    // a year without marks has no goals
    expect((await mama.get(`/api/students/${mark.id}/overview?period=week`)).body.nearGoals).toBeNull();
    const [link] = await db.select().from(familyStudents).where(eq(familyStudents.studentId, milena.id));
    await db
      .update(families)
      .set({ settings: { guidance: false } })
      .where(eq(families.id, link!.familyId));
    expect((await mama.get(`/api/students/${milena.id}/overview?period=week`)).body.nearGoals).toBeNull();
  });

  it('guidance off hides the goal row and the hints; the goal stays saved and shown in the settings', async () => {
    const { milena, signIn } = await setUp(IN_TERM);
    const mama = await signIn(DEMO_LOGINS.parent);
    const algebra = await subjectNamed(milena.id, 'Алгебра');
    const url = `/api/students/${milena.id}/subjects/${algebra.id}`;
    await mama.put(`${url}/goal`).send({ termGoal: 9 });
    expect((await mama.get(url)).body.attention.goal).not.toBeNull();
    const [link] = await db.select().from(familyStudents).where(eq(familyStudents.studentId, milena.id));
    await db
      .update(families)
      .set({ settings: { guidance: false } })
      .where(eq(families.id, link!.familyId));
    const off = (await mama.get(url)).body;
    expect(off.attention).toEqual({ goal: null, hints: [] });
    expect(off.settings).toEqual({ goal: 9, goalAvailable: true });
    // facts do not depend on it
    expect(off.comparison).not.toBeNull();
  });

  it('the colour is the family’s for the child: on the list, the feed and the lessons; a palette key or «Авто»', async () => {
    const { milena, signIn } = await setUp(IN_TERM);
    const mama = await signIn(DEMO_LOGINS.parent);
    const algebra = await subjectNamed(milena.id, 'Алгебра');
    const url = `/api/students/${milena.id}/subjects/${algebra.id}/color`;
    expect((await mama.put(url).send({ color: 'violet' })).body).toEqual({ color: 'violet' });
    expect((await mama.put(url).send({ color: 'magenta' })).status).toBe(400);
    const list = (await mama.get(`/api/students/${milena.id}/subjects?period=year`)).body.subjects as Row[];
    expect(list.find((r) => r.subject.id === algebra.id)!.subject.color).toBe('violet');
    expect(list.filter((r) => r.subject.id !== algebra.id).every((r) => r.subject.color === null)).toBe(true);
    const feed = (await mama.get(`/api/students/${milena.id}/marks?period=year&subject=${algebra.id}`)).body.items;
    expect(feed[0].subject.color).toBe('violet');
    const week = (await mama.get(`/api/students/${milena.id}/schedule?week=0`)).body.days.flatMap(
      (d: { lessons: { subjectId: string; subjectColor: string | null }[] }) => d.lessons,
    );
    expect(week.find((l: { subjectId: string }) => l.subjectId === algebra.id).subjectColor).toBe('violet');
    // the child sets their own; back to «Авто»
    const kid = await signIn(DEMO_LOGINS.student);
    expect((await kid.put(url).send({ color: null })).body).toEqual({ color: null });
    // another family reaches nothing
    const papa = await signIn(DEMO_LOGINS.otherParent);
    expect((await papa.put(url).send({ color: 'red' })).status).toBe(404);
    expect((await papa.put(url.replace('/color', '/goal')).send({ termGoal: 8 })).status).toBe(404);
  });

  it('a child followed by two families: one colour for the child, no word about who set it', async () => {
    const { mark, signIn } = await setUp(IN_TERM);
    const papa = await signIn(DEMO_LOGINS.otherParent);
    const mama = await signIn(DEMO_LOGINS.parent);
    const subject = (await db.select().from(subjects).where(eq(subjects.studentId, mark.id)))[0]!;
    const url = `/api/students/${mark.id}/subjects/${subject.id}`;
    expect((await papa.put(`${url}/color`).send({ color: 'teal' })).status).toBe(200);
    for (const agent of [mama, papa]) {
      const list = await agent.get(`/api/students/${mark.id}/subjects?period=week`);
      const row = (list.body.subjects as Row[]).find((r) => r.subject.id === subject.id)!;
      expect(row.subject.color).toBe('teal');
      const one = JSON.stringify((await agent.get(url)).body);
      expect(one).not.toMatch(/setBy|set_by|Мама|Папа/);
    }
  });

  it('«Ближайшие уроки»: the next three lessons of the subject still ahead', async () => {
    const { milena, signIn } = await setUp(IN_TERM);
    const mama = await signIn(DEMO_LOGINS.parent);
    const algebra = await subjectNamed(milena.id, 'Алгебра');
    const one = (await mama.get(`/api/students/${milena.id}/subjects/${algebra.id}`)).body;
    expect(one.upcoming.length).toBeGreaterThan(0);
    expect(one.upcoming.length).toBeLessThanOrEqual(3);
    for (const l of one.upcoming) {
      expect(l.subjectId).toBe(algebra.id);
      // 19:12 on the 15th: that day's lessons are over
      expect(l.date > '2026-10-15').toBe(true);
    }
  });
});

describe('Итоги', () => {
  afterEach(settle);

  it('while the term runs: «идёт», the running average in italics, no year value without a term final', async () => {
    const { milena, signIn } = await setUp(IN_TERM);
    const mama = await signIn(DEMO_LOGINS.parent);
    const periods = (await mama.get(`/api/students/${milena.id}/periods`)).body;
    expect(periods.finals).toMatchObject({ state: 'running', term: { index: 1, kind: 'quarter', to: '2026-10-31' } });
    const q = (await mama.get(`/api/students/${milena.id}/finals/quarters`)).body;
    expect(q.state).toEqual(periods.finals);
    const row = q.rows.find((r: { terms: { kind: string }[] }) => r.terms[0]!.kind === 'running');
    expect(row.terms[0].value).toEqual(expect.any(Number));
    expect(row.terms.slice(1).every((c: { kind: string }) => c.kind === 'none')).toBe(true);
    expect(row.year.kind).toBe('none');
    expect(q.lastYear).toBeNull();
  });

  it('after the term: «выставлена» with the day, framed finals, the year in italics until the teacher posts it', async () => {
    const { milena, signIn } = await setUp(HOLIDAYS);
    const mama = await signIn(DEMO_LOGINS.parent);
    const periods = (await mama.get(`/api/students/${milena.id}/periods`)).body;
    expect(periods.finals).toMatchObject({ state: 'posted', term: { index: 1 }, postedOn: '2026-10-31' });
    const q = (await mama.get(`/api/students/${milena.id}/finals/quarters`)).body;
    const row = q.rows.find((r: { terms: { kind: string }[] }) => r.terms[0]!.kind === 'final');
    expect(row.terms[0]).toMatchObject({ kind: 'final', postedOn: '2026-10-31', source: 'api' });
    // one term final so far: the year is that final, as a calculation, never framed
    expect(row.year).toMatchObject({ kind: 'running', value: row.terms[0].value });

    // the teacher's year final is the only framed year cell
    const [s] = await db.select().from(subjects).where(eq(subjects.id, row.subject.id));
    await db.insert(finalMarks).values({
      studentId: milena.id,
      schoolYearId: s!.schoolYearId,
      subjectId: s!.id,
      subjectName: s!.name,
      periodId: null,
      raw: '9',
      mark: 9,
      kind: 'numeric',
      source: 'api',
      firstSeenAt: HOLIDAYS,
    });
    const after = (await mama.get(`/api/students/${milena.id}/finals/quarters`)).body;
    const same = after.rows.find((r: { subject: { id: string } }) => r.subject.id === s!.id);
    expect(same.year).toMatchObject({ kind: 'final', raw: '9', value: 9 });

    // Предметы: «итог I: 8» in place of «было» while the finals are news
    const list = (await mama.get(`/api/students/${milena.id}/subjects?period=week`)).body.subjects as Row[];
    expect(list.find((r) => r.subject.id === row.subject.id)!.final).toMatchObject({ term: { index: 1 } });
    // the subject's strip and goal row
    const one = (await mama.get(`/api/students/${milena.id}/subjects/${row.subject.id}`)).body;
    expect(one.terms[0].cell.kind).toBe('final');
    expect(one.attention.goal).toBeNull();
  });

  it('Оценки: the finals card on the day they were posted, absences as quiet rows after the marks', async () => {
    const { milena, signIn } = await setUp(HOLIDAYS);
    const mama = await signIn(DEMO_LOGINS.parent);
    const feed = (await mama.get(`/api/students/${milena.id}/marks?from=2026-10-26&to=2026-11-04&limit=200`)).body;
    const card = feed.items.find((i: { type: string }) => i.type === 'finals');
    expect(card).toMatchObject({ date: '2026-10-31', term: { index: 1 } });
    expect(card.marks.length).toBeGreaterThan(0);
    expect(card.differ).toBeGreaterThanOrEqual(0);
    const filtered = (await mama.get(`/api/students/${milena.id}/marks?from=2026-10-26&to=2026-11-04&tags=t1`)).body;
    expect(filtered.items).toEqual([]);

    const year = (await mama.get(`/api/students/${milena.id}/marks?period=year&limit=200`)).body.items as {
      type: string;
      date: string;
    }[];
    const absence = year.findIndex((i) => i.type === 'absence');
    expect(absence).toBeGreaterThanOrEqual(0);
    // in a day: the marks first, then the absences
    const day = year.filter((i) => i.date === year[absence]!.date).map((i) => i.type);
    expect(day.lastIndexOf('mark')).toBeLessThan(day.indexOf('absence'));
    // a subject's timeline shows marks, not absences
    const anySubject = (await db.select().from(subjects).where(eq(subjects.studentId, milena.id)))[0]!;
    const one = (await mama.get(`/api/students/${milena.id}/subjects/${anySubject.id}?period=year`)).body;
    expect(one.timeline.every((i: { type: string }) => i.type !== 'absence' && i.type !== 'finals')).toBe(true);
  });

  it('Годы: last year’s finals by subject name, «новый предмет», the arrow against last year', async () => {
    const { milena, signIn } = await setUp(HOLIDAYS);
    const mama = await signIn(DEMO_LOGINS.parent);
    const algebra = await subjectNamed(milena.id, 'Алгебра');
    const [last] = await db
      .insert(schoolYears)
      .values({
        studentId: milena.id,
        providerId: 'demo-full',
        externalId: '2025-2026',
        label: '2025-2026',
        startDate: '2025-09-01',
        endDate: '2026-05-31',
        source: 'manual',
      })
      .returning();
    const lastFinal = (subjectName: string, mark: number) => ({
      studentId: milena.id,
      schoolYearId: last!.id,
      subjectId: null,
      subjectName,
      periodId: null,
      raw: String(mark),
      mark,
      kind: 'numeric',
      source: 'manual' as const,
    });
    await db.insert(finalMarks).values([lastFinal('Алгебра', 4), lastFinal('Природоведение', 7)]);

    const years = (await mama.get(`/api/students/${milena.id}/finals/years`)).body;
    expect(years.years.map((y: { label: string; current: boolean }) => [y.label, y.current])).toEqual([
      ['2025-2026', false],
      ['2026-2027', true],
    ]);
    const byName = Object.fromEntries(years.rows.map((r: { subjectName: string }) => [r.subjectName, r]));
    expect(byName['Природоведение']).toMatchObject({ subjectId: null, isNew: false, trend: null });
    expect(byName['Алгебра']).toMatchObject({ subjectId: algebra.id, isNew: false });
    expect(byName['Алгебра'].cells[0]).toMatchObject({ kind: 'final', value: 4, source: 'manual' });
    expect(byName['Алгебра'].cells[1].kind).toBe('running');
    expect(byName['Алгебра'].trend).toBe('up');
    const other = years.rows.find(
      (r: { subjectName: string; subjectId: string | null }) => r.subjectId && r.subjectName !== 'Алгебра',
    );
    expect(other.isNew).toBe(true);

    const q = (await mama.get(`/api/students/${milena.id}/finals/quarters`)).body;
    expect(q.lastYear).toMatchObject({ label: '2025-2026' });
    const algebraRow = q.rows.find((r: { subject: { id: string } }) => r.subject.id === algebra.id);
    expect(algebraRow.lastYear).toEqual({ raw: '4', value: 4 });
    const one = (await mama.get(`/api/students/${milena.id}/subjects/${algebra.id}`)).body;
    expect(one.lastYear).toEqual({ label: '2025-2026', raw: '4', value: 4 });
    // a subject that was not there last year: the year is known, the final is not («новый предмет в этом году»)
    const otherId = years.rows.find((r: { isNew: boolean }) => r.isNew).subjectId;
    const fresh = (await mama.get(`/api/students/${milena.id}/subjects/${otherId}`)).body;
    expect(fresh.lastYear).toEqual({ label: '2025-2026', raw: null, value: null });
  });

  it('a past year typed in: on the scale, «введено вручную», replaced as a whole, never over the diary’s years', async () => {
    const { milena, mark, signIn } = await setUp(IN_TERM);
    const mama = await signIn(DEMO_LOGINS.parent);
    const url = `/api/students/${milena.id}/final-marks`;
    const put = await mama.put(url).send({
      startYear: 2024,
      marks: [
        { subjectName: 'Алгебра', raw: '7' },
        { subjectName: 'Природоведение', raw: '9' },
      ],
    });
    expect(put.status).toBe(200);
    expect(put.body.count).toBe(2);
    const years = (await mama.get(`/api/students/${milena.id}/finals/years`)).body;
    // the label and the dates in the current year's own form, two years back
    expect(years.years.map((y: { label: string }) => y.label)).toEqual(['2024-2025', '2026-2027']);
    const [row] = await db.select().from(schoolYears).where(eq(schoolYears.id, put.body.yearId));
    expect(row).toMatchObject({ source: 'manual', startDate: '2024-09-01' });
    const algebra = years.rows.find((r: { subjectName: string }) => r.subjectName === 'Алгебра');
    expect(algebra.cells[0]).toMatchObject({ kind: 'final', raw: '7', value: 7, source: 'manual' });
    const [saved] = await db
      .select()
      .from(finalMarks)
      .where(and(eq(finalMarks.schoolYearId, put.body.yearId), eq(finalMarks.subjectName, 'Алгебра')));
    expect(saved!.enteredBy).not.toBeNull();

    // the whole year as it should be: Природоведение goes, Алгебра changes
    await mama.put(url).send({ startYear: 2024, marks: [{ subjectName: 'Алгебра', raw: '8' }] });
    const again = (await mama.get(`/api/students/${milena.id}/finals/years`)).body;
    expect(again.rows.find((r: { subjectName: string }) => r.subjectName === 'Природоведение')).toBeUndefined();
    // an empty list removes the year
    expect((await mama.put(url).send({ startYear: 2024, marks: [] })).body).toEqual({ yearId: null, count: 0 });
    expect((await mama.get(`/api/students/${milena.id}/finals/years`)).body.years).toHaveLength(1);

    const refused = async (body: object) => (await mama.put(url).send(body)).body.error?.code;
    expect(await refused({ startYear: 2026, marks: [{ subjectName: 'Алгебра', raw: '7' }] })).toBe('not_a_past_year');
    expect(await refused({ startYear: 2010, marks: [{ subjectName: 'Алгебра', raw: '7' }] })).toBe('not_a_past_year');
    expect(await refused({ startYear: 2024, marks: [{ subjectName: 'Алгебра', raw: '11' }] })).toBe('not_on_scale');
    expect(await refused({ startYear: 2024, marks: [{ subjectName: 'Алгебра', raw: '7,5' }] })).toBe('not_on_scale');
    expect(
      await refused({
        startYear: 2024,
        marks: [
          { subjectName: 'Алгебра', raw: '7' },
          { subjectName: 'алгебра', raw: '8' },
        ],
      }),
    ).toBe('duplicate_subject');
    // a year without marks has nothing to type in; a student types nothing
    expect((await mama.put(`/api/students/${mark.id}/final-marks`).send({ startYear: 2024, marks: [] })).status).toBe(
      400,
    );
    const student = await signIn(DEMO_LOGINS.student);
    expect((await student.put(url).send({ startYear: 2024, marks: [] })).status).toBe(403);
    // a year the diary sends stays the diary's
    await db.insert(schoolYears).values({
      studentId: milena.id,
      providerId: 'demo-full',
      externalId: '2025-2026',
      label: '2025-2026',
      startDate: '2025-09-01',
      endDate: '2026-05-31',
      source: 'api',
    });
    expect(await refused({ startYear: 2025, marks: [{ subjectName: 'Алгебра', raw: '7' }] })).toBe('year_from_diary');
  });
});
