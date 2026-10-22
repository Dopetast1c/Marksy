import { createMemoryDrift, driftChecker } from '@marksy/core';
import { describe, expect, it } from 'vitest';
import { toISODate } from './dates';
import { currentClass, mapCalendar, mapFinals, mapLessonsWeek, mapStudent } from './map';
import { lessonsDay } from './schemas';
import type { LessonMark, SchoolYearResponse, TimeActivity } from './schemas';

// Fictional data shaped like docs/api-spec.md 6 and 7. Times are Minsk midnights in milliseconds.

const TZ = 'Europe/Minsk';
const minsk = (date: string) => Date.parse(`${date}T00:00:00+03:00`);
const setup = () => {
  const drift = createMemoryDrift();
  return { drift, check: driftChecker(drift, 'test') };
};

const mark = (over: Partial<LessonMark>): LessonMark => ({
  uuid: 'm-1',
  type: null,
  mark: '8',
  kind: 'SINGLE',
  comment: '',
  author: 't-1',
  ...over,
});
const slot = (over: Record<string, unknown> = {}) => ({
  lesson_uuid: 'l-1',
  lesson_template_id: 'tpl',
  subject_id: 's-alg',
  subject_title: 'Алгебра',
  teacher_id: 't-1',
  type: null,
  number: 2,
  topic: 'Системы уравнений',
  homework: null,
  message: '',
  start_time: '09:25',
  has_attachments_or_links: false,
  homework_source_id: null,
  lesson_mark: null,
  substitution: null,
  ...over,
});
const week = (slots: unknown[]) => [lessonsDay.parse({ day_of_week: 1, date: minsk('2026-10-12'), slots })];

describe('dates', () => {
  it('reads millisecond midnights as Minsk days', () => {
    expect(toISODate(Date.parse('2026-08-31T21:00:00Z'), TZ)).toBe('2026-09-01');
    expect(toISODate(minsk('2026-10-30'), TZ)).toBe('2026-10-30');
  });
});

describe('students and classes', () => {
  it('takes the class that is not disbanded', () => {
    const cls = currentClass([
      { uuid: 'old', level: 6, label: 'Г', class_number: '6Г', dt_disbanded: 123 },
      { uuid: 'now', level: 7, label: 'Г', class_number: '7Г', dt_disbanded: null },
    ]);
    expect(mapStudent({ profile_id: 'p-1', full_name: 'Ученица Первая', school_id: 'sch' }, cls)).toEqual({
      externalId: 'p-1',
      fullName: 'Ученица Первая',
      schoolId: 'sch',
      classExternalId: 'now',
      className: '7Г',
      grade: 7,
    });
  });
});

describe('calendar', () => {
  const year: SchoolYearResponse = {
    uuid: 'y',
    label: '2026/2027',
    start_ts: minsk('2026-09-01'),
    end_ts: minsk('2027-05-31'),
  };
  const ta = (uuid: string, type: string, title: string, start: string, end: string): TimeActivity => ({
    uuid,
    type,
    title,
    description: null,
    start_date: minsk(start),
    end_date: minsk(end),
  });
  const activities = [
    ta('q2', 'QUARTER', 'SECOND_QUARTER', '2026-11-08', '2026-12-23'),
    ta('q1', 'QUARTER', 'FIRST_QUARTER', '2026-08-31', '2026-10-30'),
    ta('h1', 'HOLIDAYS', 'AUTUMN_HOLIDAYS', '2026-10-31', '2026-11-07'),
  ];

  it('maps quarters in order and holidays, inclusive ends', () => {
    const { check } = setup();
    const c = mapCalendar(year, activities, { grade: 7 }, TZ, check);
    expect(c.terms.map((t) => [t.externalId, t.index, t.start, t.end])).toEqual([
      ['q1', 1, '2026-08-31', '2026-10-30'],
      ['q2', 2, '2026-11-08', '2026-12-23'],
    ]);
    expect(c.holidays).toEqual([{ from: '2026-10-31', to: '2026-11-07' }]);
    expect(c.schoolYear).toEqual({ externalId: 'y', label: '2026/2027', start: '2026-09-01', end: '2027-05-31' });
    expect(c.gradingScaleId).toBeUndefined();
  });

  it('a first grader has no grading scale this year', () => {
    const { check } = setup();
    expect(mapCalendar(year, activities, { grade: 1 }, TZ, check).gradingScaleId).toBeNull();
    expect(mapCalendar(year, activities, { grade: 3 }, TZ, check).gradingScaleId).toBeUndefined();
  });

  it('records a new activity type as drift and leaves it out', () => {
    const { drift, check } = setup();
    const c = mapCalendar(
      year,
      [...activities, ta('x', 'TRIMESTER', 'X', '2027-01-10', '2027-03-19')],
      { grade: 7 },
      TZ,
      check,
    );
    expect(c.terms).toHaveLength(2);
    expect(drift.events).toContainEqual({
      kind: 'new_enum_value',
      endpoint: 'test',
      path: 'time_activities[].type',
      sample: 'TRIMESTER',
    });
  });
});

describe('lessons and marks', () => {
  it('maps a lesson with its fields', () => {
    const { check } = setup();
    const [l] = mapLessonsWeek(
      week([slot({ homework: ' стр. 45 № 3 ', type: 'TEST', has_attachments_or_links: true })]),
      TZ,
      check,
    );
    expect(l).toEqual({
      externalId: 'l-1',
      date: '2026-10-12',
      slot: 2,
      startTime: '09:25',
      subjectExternalId: 's-alg',
      subjectName: 'Алгебра',
      teacherExternalId: 't-1',
      topic: 'Системы уравнений',
      homework: 'стр. 45 № 3',
      hasAttachments: true,
      lessonType: 'test',
      marks: [],
    });
  });

  it('single and double marks are numeric, each value counts', () => {
    const { check } = setup();
    const lessons = mapLessonsWeek(
      week([
        slot({ lesson_mark: mark({ mark: '8', type: 'HOMEWORK', comment: 'Молодец ' }) }),
        slot({
          lesson_uuid: 'l-2',
          lesson_mark: mark({ uuid: 'm-2', mark: '7/9', kind: 'DOUBLE', type: 'INDEPENDENT_WORK' }),
        }),
      ]),
      TZ,
      check,
    );
    expect(lessons.map((l) => l.marks[0])).toEqual([
      expect.objectContaining({
        raw: '8',
        kind: 'numeric',
        values: [8],
        workType: 'homework',
        workTypeRaw: 'HOMEWORK',
        comment: 'Молодец',
      }),
      expect.objectContaining({ raw: '7/9', kind: 'numeric', values: [7, 9], workType: 'quiz' }),
    ]);
    expect(lessons[0]!.marks[0]).toMatchObject({ externalId: 'm-1', lessonExternalId: 'l-1', authorExternalId: 't-1' });
  });

  it('an absence is attendance, never a mark', () => {
    const { check } = setup();
    const [l] = mapLessonsWeek(week([slot({ lesson_mark: mark({ kind: 'ABSENT', mark: null }) })]), TZ, check);
    expect(l!.marks).toEqual([]);
    expect(l!.attendance).toEqual([
      {
        externalId: 'm-1',
        date: '2026-10-12',
        lessonExternalId: 'l-1',
        subjectExternalId: 's-alg',
        status: 'absent',
        code: 'н',
      },
    ]);
  });

  it('pass, exempt and not-taken are text chips without values', () => {
    const { check } = setup();
    const kinds = ['PASS', 'NOT_PASS', 'EXEMPT', 'MASTERED', 'NOT_MASTERED', 'NOT_TAKEN'];
    const lessons = mapLessonsWeek(
      week(
        kinds.map((kind, i) =>
          slot({ lesson_uuid: `l-${i}`, lesson_mark: mark({ uuid: `m-${i}`, kind, mark: null }) }),
        ),
      ),
      TZ,
      check,
    );
    expect(lessons.map((l) => [l.marks[0]!.raw, l.marks[0]!.kind, l.marks[0]!.values])).toEqual([
      ['зач.', 'pass', []],
      ['незач.', 'fail', []],
      ['освоб.', 'exempt', []],
      ['осв.', 'pass', []],
      ['не осв.', 'fail', []],
      ['н/а', 'not_assessed', []],
    ]);
  });

  it('unknown fields, kinds and types are drift, never a crash', () => {
    const { drift, check } = setup();
    const lessons = mapLessonsWeek(
      week([
        slot({ brand_new: 1, type: 'SEMINAR', lesson_mark: mark({ kind: 'TRIPLE', type: 'POSTER', mark: '9' }) }),
        { lesson_uuid: 'broken' },
      ]),
      TZ,
      check,
    );
    expect(lessons).toHaveLength(1);
    expect(lessons[0]!.marks[0]).toMatchObject({ kind: 'other', values: [], workType: 'other', workTypeRaw: 'POSTER' });
    expect(lessons[0]!.lessonType).toBeUndefined();
    expect(drift.events.map((e) => [e.kind, e.path])).toEqual(
      expect.arrayContaining([
        ['unknown_field', 'days[].slots[].brand_new'],
        ['missing_field', 'days[].slots[].subject_id'],
        ['new_enum_value', 'slots[].type'],
        ['new_enum_value', 'lesson_mark.kind'],
        ['new_enum_value', 'lesson_mark.type'],
      ]),
    );
  });
});

describe('final marks (provisional shape)', () => {
  const subjects = [{ externalId: 's-alg', name: 'Алгебра' }];
  const terms = [
    { externalId: 'q1', kind: 'quarter' as const, index: 1, label: 'I', start: '2026-08-31', end: '2026-10-30' },
  ];

  it('maps term and year finals, skips unknown periods as drift', () => {
    const { drift, check } = setup();
    const finals = mapFinals(
      {
        marks: {
          's-alg': { q1: { mark: '8', kind: 'SINGLE' }, YEAR: { mark: '9', kind: 'SINGLE' }, odd: { mark: '7' } },
        },
      },
      subjects,
      terms,
      check,
    );
    expect(finals).toEqual([
      {
        subjectExternalId: 's-alg',
        subjectName: 'Алгебра',
        termExternalId: 'q1',
        raw: '8',
        value: 8,
        kind: 'numeric',
        role: 'final',
      },
      {
        subjectExternalId: 's-alg',
        subjectName: 'Алгебра',
        termExternalId: null,
        raw: '9',
        value: 9,
        kind: 'numeric',
        role: 'final',
      },
    ]);
    expect(drift.events.map((e) => e.path)).toContain('final.marks.*.period');
  });

  it('the empty response before the first quarter ends is no finals', () => {
    const { check } = setup();
    expect(mapFinals({ marks: {}, behaviour: {}, diary_signature: {} }, subjects, terms, check)).toEqual([]);
  });
});
