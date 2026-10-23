import { createMemoryDrift, driftChecker } from '@marksy/core';
import { describe, expect, it } from 'vitest';
import bells from './testdata/school-bells-1.json';
import planning2 from './testdata/school-planning-2.json';
import premises from './testdata/school-premises-1.json';
import rows2 from './testdata/school-student_subjects-2.json';
import timetable2 from './testdata/school-timetable-2.json';
import { redactRaw } from './redact';
import { createSanitizer, keepsString, PREMISE_TYPE_NAME } from './sanitize';
import { findLeaks, sensitiveValues } from './probe';
import { bellScheduleRaw, classTimetable, planningSubject, premise, studentSubjectRow } from './schemas';
import {
  enrichSubjects,
  mapBellSchedules,
  mapWeekTemplate,
  pickTimetable,
  roomFacts,
  studentTemplates,
} from './school';
import type { LessonRefs } from './school';

// A fictional school (src/testdata, sanitised like a fixture but kept apart from the probe's fixture set): English, Informatics and Labour are split into two subgroups; the student is in one.

const schedules = bells.map((b) => bellScheduleRaw.parse(b));
const timetable = classTimetable.parse(timetable2[0]);
const planning = planning2.map((p) => planningSubject.parse(p));
const rows = rows2.map((r) => studentSubjectRow.parse(r));
const rooms = premises.map((p) => premise.parse(p));
const check = () => driftChecker(createMemoryDrift(), 'test');

/** The student's lessons: every template the timetable shows except the other subgroups' */
function lessonRefs(): LessonRefs {
  const own = planning.flatMap((p) =>
    (p.templates ?? [])
      .filter((t) => !t.uuid.endsWith('other'))
      .slice(0, 1)
      .map((t) => [p.uuid, t] as const),
  );
  const teachers = new Map(own.map(([subject, t]) => [subject, new Set([t.teacher!.id!])]));
  return { templates: new Set(own.map(([, t]) => t.uuid)), teachers };
}
const otherTemplates = planning.flatMap((p) => (p.templates ?? []).slice(1)).map((t) => t.uuid);
const otherTeachers = planning.flatMap((p) => (p.templates ?? []).slice(1)).map((t) => t.teacher!.id!);

describe('school details of one student', () => {
  it("the regular week holds the student's own subgroup only, never the other one or its teacher", () => {
    const refs = lessonRefs();
    const mine = studentTemplates(planning, refs);
    for (const t of otherTemplates) expect(mine.has(t)).toBe(false);
    const week = mapWeekTemplate(timetable, planning, rows, rooms, mine, [{ externalId: 'q1', index: 1 }], new Map());
    expect(week.termExternalId).toBe('q1');
    expect(week.entries.length).toBeGreaterThan(20);
    for (const e of week.entries) {
      expect(otherTemplates).not.toContain(e.templateRef);
      expect(otherTeachers).not.toContain(e.teacherExternalId);
    }
    const english = week.entries.filter((e) => e.groupLabel === '2-я подгруппа');
    expect(english.length).toBe(3);
    expect(
      week.entries.some(
        (e) => e.groupLabel === '1-я подгруппа' && english.some((x) => x.subjectExternalId === e.subjectExternalId),
      ),
    ).toBe(false);
  });

  it("a room missing from the school's list is left out, not guessed", () => {
    const moved = structuredClone(timetable);
    const first = moved.days_of_week[0]!.timetable_slots[0]!;
    first.slots = first.slots.map((s) => ({ ...s, room_id: 'not-in-the-list' }));
    const mine = studentTemplates(planning, lessonRefs());
    const week = mapWeekTemplate(moved, planning, rows, rooms, mine, [], new Map());
    const entry = week.entries.find(
      (e) => e.weekday === moved.days_of_week[0]!.day_of_week % 7 && e.slot === first.time_of_bells!.number,
    )!;
    expect(entry).toBeDefined();
    expect(entry.room).toBeUndefined();
    expect(week.entries.filter((e) => e.room).length).toBe(week.entries.length - 1);
  });

  it("subjects carry the student's teacher, group, level and lessons per week; a split subject with no lesson seen has neither", () => {
    const refs = lessonRefs();
    const subjects = planning.map((p) => ({ externalId: p.uuid, name: p.uuid }));
    const rich = enrichSubjects(subjects, rows, planning, studentTemplates(planning, refs), refs, check());
    const split = rich.filter((s) => s.groupLabel);
    expect(split.map((s) => s.groupLabel).sort()).toEqual([
      '1-я подгруппа',
      '1-я подгруппа (девочки)',
      '2-я подгруппа',
    ]);
    expect(rich.find((s) => s.groupLabel === '2-я подгруппа')).toMatchObject({
      level: 'advanced',
      levelLabel: 'Углубленный',
      lessonsPerWeek: 3,
    });
    for (const s of rich) expect(otherTeachers).not.toContain(s.teacherExternalId);

    // nothing seen yet: only whole-class subjects get a teacher; split ones stay without group and teacher
    const none: LessonRefs = { templates: new Set(), teachers: new Map() };
    const bare = enrichSubjects(subjects, rows, planning, studentTemplates(planning, none), none, check());
    expect(bare.filter((s) => s.groupLabel)).toEqual([]);
    const splitIds = new Set(split.map((s) => s.externalId));
    expect(bare.filter((s) => splitIds.has(s.externalId) && s.teacherName)).toEqual([]);
  });

  it('bells: the schedule the class timetable names, or the only one for the grade, never a guess between shifts', () => {
    const named = mapBellSchedules(schedules, timetable, 7);
    expect(named).toHaveLength(1);
    expect(named[0]!.periods).toHaveLength(7);
    expect(named[0]!.days).toEqual([1, 2, 3, 4, 5, 6]);
    // grade 7 appears in both shifts: without the timetable there is no answer
    expect(mapBellSchedules(schedules, undefined, 7)).toEqual([]);
    // grade 1 has one schedule of its own
    expect(mapBellSchedules(schedules, undefined, 1)[0]!.periods[0]).toEqual({ slot: 1, start: '08:30', end: '09:05' });
  });

  it('teachers of every group are dropped before a body is stored, and never kept in fixtures', () => {
    expect(JSON.stringify(redactRaw('student_subjects', rows2))).not.toContain('"teacher"');
    expect(JSON.stringify(redactRaw('planning', planning2))).not.toContain('"teacher"');
    const place = { endpoint: 'student_subjects-1', key: 'teacher', container: null, depth: 1 };
    expect(keepsString(place, 'Иванова Мария Петровна')).toBe(false);
    expect(keepsString({ ...place, key: 'group_name' }, '2-я подгруппа (мальчики)')).toBe(true);
    expect(keepsString({ ...place, key: 'name', container: 'study_group' }, 'Иванова Мария Петровна')).toBe(false);
  });
});

describe('school details fail closed', () => {
  const subjects = planning.map((p) => ({ externalId: p.uuid, name: p.uuid }));

  it("a substitute from the other subgroup pulls in neither its template nor its teacher: two groups' evidence gives nothing", () => {
    const refs = lessonRefs();
    const split = planning.find((p) => p.partition_type === 'GROUP')!;
    const other = split.templates![1]!;
    // a lesson without a template ref, given by the other subgroup's teacher
    const teachers = new Map(refs.teachers);
    teachers.set(split.uuid, new Set([...(teachers.get(split.uuid) ?? []), other.teacher!.id!]));
    const mixed: LessonRefs = { templates: refs.templates, teachers };
    const mine = studentTemplates(planning, mixed);
    for (const t of split.templates!) expect(mine.has(t.uuid)).toBe(false);
    const rich = enrichSubjects(subjects, rows, planning, mine, mixed, check());
    const subject = rich.find((s) => s.externalId === split.uuid)!;
    for (const k of ['teacherExternalId', 'teacherName', 'groupLabel', 'lessonsPerWeek'] as const)
      expect(subject[k], k).toBeUndefined();
    const week = mapWeekTemplate(timetable, planning, rows, rooms, mine, [], new Map());
    expect(week.entries.some((e) => e.subjectExternalId === split.uuid)).toBe(false);
  });

  it('a split subject that lost its partition type or its groups gives no group, no teacher and no other lessons', () => {
    const blurred = planning.map((p) =>
      p.partition_type === 'GROUP'
        ? { ...p, partition_type: null, templates: p.templates!.map((t) => ({ ...t, study_group: null })) }
        : p,
    );
    const refs = lessonRefs();
    const mine = studentTemplates(blurred, refs);
    for (const t of otherTemplates) expect(mine.has(t)).toBe(false);
    const rich = enrichSubjects(
      subjects,
      rows.map((r) => ({ ...r, partition_type: null })),
      blurred,
      mine,
      refs,
      check(),
    );
    for (const s of rich) expect(otherTeachers).not.toContain(s.teacherExternalId);
    expect(rich.filter((s) => s.groupLabel)).toEqual([]);
    // whole-class subjects keep their one teacher
    expect(rich.filter((s) => s.teacherName).length).toBeGreaterThan(5);
  });

  it("a group subject with one template planned so far is the student's only on their lessons' evidence", () => {
    const split = planning.find((p) => p.partition_type === 'GROUP')!;
    const lone = { ...split, templates: split.templates!.slice(1) };
    const none: LessonRefs = { templates: new Set(), teachers: new Map() };
    expect(studentTemplates([lone], none).size).toBe(0);
    const seen: LessonRefs = { templates: new Set([lone.templates[0]!.uuid]), teachers: new Map() };
    expect([...studentTemplates([lone], seen)]).toEqual([lone.templates[0]!.uuid]);
  });

  it('a subject without templates this period is no error', () => {
    const empty = planningSubject.parse({ ...planning2[0], templates: null });
    expect(studentTemplates([empty], lessonRefs()).size).toBe(0);
  });
});

describe('which timetable is the regular week', () => {
  const quarters = [
    { kind: 'quarter' as const, index: 1, start: '2026-09-01', end: '2026-10-25' },
    { kind: 'quarter' as const, index: 2, start: '2026-11-03', end: '2026-12-24' },
    { kind: 'quarter' as const, index: 3, start: '2027-01-12', end: '2027-03-22' },
    { kind: 'quarter' as const, index: 4, start: '2027-04-01', end: '2027-05-31' },
  ];
  const q1 = { ...timetable, uuid: 'q1', period: 'FIRST_QUARTER' };
  const h1 = { ...timetable, uuid: 'h1', period: 'FIRST_HALF_YEAR' };
  const h2 = { ...timetable, uuid: 'h2', period: 'SECOND_HALF_YEAR' };

  it('the one whose period covers today, the narrower when a quarter and a half year both do', () => {
    const drift = createMemoryDrift();
    const c = driftChecker(drift, 'timetables');
    const pick = (today: string) => pickTimetable([h1, q1, h2], quarters, today, c)?.uuid;
    expect(pick('2026-10-01')).toBe('q1');
    expect(pick('2026-10-28')).toBe('h1'); // autumn break: inside the half year only
    expect(pick('2026-12-01')).toBe('h1');
    expect(pick('2026-12-30')).toBe('h2'); // winter break: the next to start
    expect(pick('2027-02-01')).toBe('h2');
    expect(pick('2027-07-01')).toBe('h2'); // summer: the latest
    expect(drift.events).toEqual([]);
    pickTimetable([{ ...timetable, period: 'WHOLE_YEAR' }], quarters, '2026-10-01', c);
    expect(drift.events.map((e) => [e.kind, e.path])).toEqual([['new_enum_value', 'timetables[].period']]);
  });

  it("a half year's week belongs to no single term", () => {
    const mine = studentTemplates(planning, lessonRefs());
    const terms = quarters.map((q) => ({ externalId: `q${q.index}`, index: q.index }));
    expect(mapWeekTemplate(h1, planning, rows, rooms, mine, terms, new Map()).termExternalId).toBeUndefined();
    expect(mapWeekTemplate(q1, planning, rows, rooms, mine, terms, new Map()).termExternalId).toBe('q1');
  });

  it("room counts for the probe: the student's slots without a room, with a room the school's list lacks", () => {
    const mine = studentTemplates(planning, lessonRefs());
    const base = roomFacts(timetable, mine, rooms);
    expect(base).toMatchObject({ withoutRoom: 0, roomNotListed: 0, roomWithoutNumber: 0, premises: rooms.length });
    expect(base.slots).toBeGreaterThan(20);
    const moved = structuredClone(timetable);
    const own = moved.days_of_week
      .flatMap((d) => d.timetable_slots.flatMap((ts) => ts.slots))
      .filter((s) => s.lesson_template_id && mine.has(s.lesson_template_id));
    own[0]!.room_id = null;
    own[1]!.room_id = 'not-in-the-list';
    expect(roomFacts(moved, mine, rooms)).toMatchObject({ slots: base.slots, withoutRoom: 1, roomNotListed: 1 });
  });
});

describe('the school lists in fixtures', () => {
  const s = createSanitizer(Buffer.alloc(32, 7));
  const planningRaw = [
    {
      uuid: 'subject-1',
      summary: 'Иванова Мария Петровна',
      author: 'author-1',
      school_subject: {
        uuid: 'ss-1',
        summary: 'Математика',
        as_json: {
          short_name: 'Матем.',
          summary: 'Математика',
          author: 'author-1',
          subject: { uuid: 'cat-1', as_json: { value: 'Математика' } },
        },
      },
      templates: [{ uuid: 'tpl-1', teacher: { id: 'teacher-1', name: 'Мария', surname: 'Иванова' } }],
    },
  ];
  const premisesRaw = [
    {
      uuid: 'room-1',
      audience_number: 'Спортзал',
      summary: 'Спортзал',
      author: 'author-1',
      premise_type: { uuid: 'type-1', as_json: { name: 'Спортзал', short_name: 'спорт. зал', summary: 'Спортзал' } },
    },
    { uuid: 'room-2', audience_number: '101С', audience_name: 'кабинет Ивановой М.П.', hull: null },
  ];
  const subjectsRaw = [{ uuid: 'subject-1', name: 'Математика' }];

  it('drops the free text of the plan and the room list; a premise type gets one typical name, a room a fake number', () => {
    const p = JSON.stringify(s.sanitize('planning-1', planningRaw));
    expect(p).not.toMatch(/summary|author|Иванова|Мария|"subject"/);
    expect(p).toContain('Матем.');
    const r = s.sanitize('premises-1', premisesRaw) as typeof premisesRaw;
    expect(JSON.stringify(r)).not.toMatch(/summary|author/);
    expect(r[0]!.premise_type!.as_json).toEqual({ name: PREMISE_TYPE_NAME, short_name: 'каб.' });
    expect(r[0]!.audience_number).toBe('Спортзал');
    // a numbered room keeps its form only; a room's own name never stays
    expect(r[1]!.audience_number).toMatch(/^\d{3}А$/);
    expect(r[1]!.audience_number).not.toBe('101А');
    expect(JSON.stringify(r)).not.toContain('audience_name');
    expect(s.sanitize('premises-1', r)).toEqual(r);
  });

  it("the probe's leak check skips that dropped text, even when it is a name another place keeps; a teacher still counts", () => {
    const sensitive = sensitiveValues('planning-1', planningRaw);
    sensitiveValues('premises-1', premisesRaw, [], sensitive);
    sensitiveValues('subjects-1', subjectsRaw, [], sensitive);
    const out = [
      s.sanitize('planning-1', planningRaw),
      s.sanitize('premises-1', premisesRaw),
      s.sanitize('subjects-1', subjectsRaw),
    ];
    expect(findLeaks(out, sensitive)).toEqual([]);
    expect(findLeaks([...out, { short_name: 'Иванова' }], sensitive)).toEqual([
      'planning-1: [].templates[].teacher.surname',
    ]);
  });

  it('bells become one fictional scheme by lesson number, subgroups lose who is in them; idempotent', () => {
    const bellsRaw = [
      {
        uuid: 'b-1',
        levels: [7, 4],
        days_of_week: [
          {
            days: [1, 2],
            time_of_bells: [
              { number: 0, start_time: '12:50:00', end_time: '13:35:00' },
              { number: 1, start_time: '14:00:00', end_time: '14:45:00' },
            ],
          },
        ],
      },
    ];
    const b = s.sanitize('bells-1', bellsRaw) as typeof bellsRaw;
    expect(b[0]!.days_of_week[0]!.time_of_bells).toEqual([
      { number: 0, start_time: '07:05:00', end_time: '07:50:00' },
      { number: 1, start_time: '08:00:00', end_time: '08:45:00' },
    ]);
    expect(b[0]!.levels).toEqual([7, 4]);
    expect(s.sanitize('bells-1', b)).toEqual(b);
    // a lesson's start follows its number the same way
    const lessonsRaw = [{ date: 0, slots: [{ number: 3, start_time: '10:55', subject_id: 's' }] }];
    expect((s.sanitize('lessons-1-w1', lessonsRaw) as typeof lessonsRaw)[0]!.slots[0]!.start_time).toBe('09:50');
    const rows = s.sanitize('student_subjects-1', [
      { group_name: '1-я подгруппа (девочки)' },
      { group_name: '2-я подгруппа' },
    ]);
    expect(rows).toEqual([{ group_name: '1-я подгруппа' }, { group_name: '2-я подгруппа' }]);
    const plan = s.sanitize('planning-1', [{ templates: [{ study_group: { name: '2-я подгруппа (мальчики)' } }] }]);
    expect(JSON.stringify(plan)).not.toContain('мальчики');
  });

  it('a short name is kept only as a subject short name in the plan', () => {
    const place = {
      endpoint: 'planning-1',
      key: 'short_name',
      container: 'as_json',
      outer: 'school_subject',
      depth: 3,
    };
    expect(keepsString(place, 'Матем.')).toBe(true);
    expect(keepsString({ ...place, outer: 'teacher' }, 'Матем.')).toBe(false);
    expect(keepsString({ ...place, container: 'teacher', outer: null }, 'Иванова')).toBe(false);
  });
});
