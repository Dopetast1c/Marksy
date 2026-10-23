import { createMemoryDrift, driftChecker } from '@marksy/core';
import { describe, expect, it } from 'vitest';
import bells from '../fixtures/bells-1.json';
import planning2 from '../fixtures/planning-2.json';
import premises from '../fixtures/premises-1.json';
import rows2 from '../fixtures/student_subjects-2.json';
import timetable2 from '../fixtures/timetable-2.json';
import { redactRaw } from './redact';
import { keepsString } from './sanitize';
import { bellScheduleRaw, classTimetable, planningSubject, premise, studentSubjectRow } from './schemas';
import { enrichSubjects, mapBellSchedules, mapWeekTemplate, studentTemplates } from './school';
import type { LessonRefs } from './school';

// The fixtures' fictional school: English, Informatics and Labour are split into two subgroups; the student is in one.

const schedules = bells.map((b) => bellScheduleRaw.parse(b));
const timetable = classTimetable.parse(timetable2[0]);
const planning = planning2.map((p) => planningSubject.parse(p));
const rows = rows2.map((r) => studentSubjectRow.parse(r));
const rooms = premises.map((p) => premise.parse(p));
const check = () => driftChecker(createMemoryDrift(), 'test');

/** The student's lessons: every template the timetable shows except the other subgroups' */
function lessonRefs(): LessonRefs {
  const own = planning.flatMap((p) =>
    p.templates
      .filter((t) => !t.uuid.endsWith('other'))
      .slice(0, 1)
      .map((t) => [p.uuid, t] as const),
  );
  const teachers = new Map(own.map(([subject, t]) => [subject, new Set([t.teacher!.id!])]));
  return { templates: new Set(own.map(([, t]) => t.uuid)), teachers };
}
const otherTemplates = planning.flatMap((p) => p.templates.slice(1)).map((t) => t.uuid);
const otherTeachers = planning.flatMap((p) => p.templates.slice(1)).map((t) => t.teacher!.id!);

describe('school details of one student', () => {
  it("the regular week holds the student's own subgroup only, never the other one or its teacher", () => {
    const refs = lessonRefs();
    const mine = studentTemplates(planning, refs);
    for (const t of otherTemplates) expect(mine.has(t)).toBe(false);
    const week = mapWeekTemplate(
      timetable,
      planning,
      rows,
      rooms,
      mine,
      [{ externalId: 'q1', index: 1 }],
      new Map(),
      check(),
    );
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
    const week = mapWeekTemplate(moved, planning, rows, rooms, mine, [], new Map(), check());
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
    expect(JSON.stringify(redactRaw(rows2))).not.toContain('"teacher"');
    expect(JSON.stringify(redactRaw(planning2))).not.toContain('"teacher"');
    const place = { endpoint: 'student_subjects-1', key: 'teacher', container: null, depth: 1 };
    expect(keepsString(place, 'Иванова Мария Петровна')).toBe(false);
    expect(keepsString({ ...place, key: 'group_name' }, '2-я подгруппа (мальчики)')).toBe(true);
    expect(keepsString({ ...place, key: 'name', container: 'study_group' }, 'Иванова Мария Петровна')).toBe(false);
  });
});
