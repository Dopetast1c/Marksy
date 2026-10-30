import { describe, expect, it } from 'vitest';
import {
  countLeaks,
  endpointName,
  findLeaks,
  MAX_WEEKS,
  report,
  reportable,
  sanitisedRoute,
  sensitiveValues,
  weeksArg,
} from './probe';
import { createSanitizer, fakeUuid, sanitize } from './sanitize';
import type { ProbeFacts } from './probe';

// All values are invented. The reviewer's cases: a substitute teacher object, homework as an object, numeric ids,
// a name inside a kept field, ids in URLs.

const S1 = '2b8c4d6e-1f3a-4b5c-8d7e-9f0a1b2c3d4e';
const W1 = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
const D = 'https://diary.example.com/api/v1/education/diary';

describe('endpoint names and routes', () => {
  it('names every endpoint the way the fixtures are named', () => {
    const name = (method: string, url: string) => endpointName(method, new URL(url), [S1], [W1]);
    expect(name('POST', 'https://diary.example.com/api/v1/auth/login/parent')).toBe('login');
    expect(name('GET', 'https://diary.example.com/api/v1/admin/auth/me')).toBe('me');
    expect(name('GET', `${D}/time_activities/week_activities`)).toBe('week_activities');
    expect(name('GET', `${D}/schools/s/students/${S1}/classes`)).toBe('classes-1');
    expect(name('GET', `${D}/schools/s/classes/c/students/${S1}/lessons?week_activity_uuid=${W1}`)).toBe(
      'lessons-1-w1',
    );
    expect(name('GET', `${D}/schools/s/classes/c/students/${S1}/final/whole`)).toBe('final-1');
    expect(name('GET', `${D}/somewhere/else`)).toBeNull();
  });

  it('names the school details by student, class and school; the rooms filter stays out of the route', () => {
    const name = (url: string) => endpointName('GET', new URL(url), [S1], [W1], ['c'], ['s']);
    const API = 'https://diary.example.com/api/v1';
    expect(name(`${D}/schools/s/students/${S1}/classes/c/subjects`)).toBe('student_subjects-1');
    expect(name(`${D}/schools/s/bells/whole`)).toBe('bells-1');
    expect(name(`${D}/schools/s/classes/c/timetables/whole`)).toBe('timetable-1');
    expect(name(`${API}/education/planning/classes/c/educational_subjects`)).toBe('planning-1');
    expect(name(`${API}/institution/schools/s/premises?q=%7B%7D`)).toBe('premises-1');
    expect(sanitisedRoute('GET', new URL(`${API}/institution/schools/4711/premises?q=%7B%7D`))).toBe(
      `GET /api/v1/institution/schools/${fakeUuid('4711')}/premises`,
    );
  });

  it('fakes every id segment of a route, uuid or not, the way sanitize() fakes ids', () => {
    const route = sanitisedRoute(
      'GET',
      new URL(`${D}/schools/4711/classes/c-7/students/${S1}/lessons?week_activity_uuid=${W1}`),
    );
    expect(route).toBe(
      `GET /api/v1/education/diary/schools/${fakeUuid('4711')}/classes/${fakeUuid('c-7')}/students/${fakeUuid(S1)}/lessons?week_activity_uuid=${fakeUuid(W1)}`,
    );
    expect((sanitize('me', { profile_id: S1 }) as { profile_id: string }).profile_id).toBe(fakeUuid(S1));
  });
});

describe('sanitize is an allow-list', () => {
  it('cleans fields nobody listed: a substitute teacher, homework as an object, numeric ids', () => {
    const out = sanitize('lessons-1-w1', [
      {
        date: 1791752400000,
        slots: [
          {
            subject_title: 'Алгебра',
            number: 2,
            substitution: { teacher_id: S1, teacher_fio: 'Сосновая Ирина Олеговна', short_name: 'Сосновая И.О.' },
            homework: { text: 'Ника, принеси тетрадь' },
            school: { id: 4711, number: 141, name: 'Средняя школа' },
          },
        ],
      },
    ]);
    expect(out).toEqual([
      {
        date: 1791752400000,
        slots: [
          {
            subject_title: 'Алгебра',
            number: 2,
            substitution: { teacher_id: fakeUuid(S1), teacher_fio: '[text]', short_name: '[text]' },
            homework: { text: '[text]' },
            school: { id: 0, number: 0, name: '[text]' },
          },
        ],
      },
    ]);
  });

  it('fake ids depend on a key that lives only as long as the run', () => {
    const a = createSanitizer(Buffer.alloc(32, 1));
    const b = createSanitizer(Buffer.alloc(32, 2));
    expect(a.fakeId(S1)).toBe(a.fakeId(S1));
    expect(a.fakeId(S1)).not.toBe(b.fakeId(S1));
    expect(a.fakeId(a.fakeId(S1))).toBe(a.fakeId(S1));
  });
});

describe('leak check', () => {
  it('collects what sanitize() does not keep, and finds nothing after sanitising', () => {
    const raw = {
      full_name: 'Фамилия Имя Отчество',
      students_for_parent: [{ profile_id: S1, full_name: 'Ребёнок Тестовый', school_id: S1 }],
      days: [
        {
          slots: [
            { topic: 'Тема про кого-то', subject_title: 'Алгебра', lesson_mark: { mark: '8', comment: 'Хорошо!' } },
          ],
        },
      ],
      marks: { [W1]: {} },
      school: { id: 4711 },
    };
    const sensitive = sensitiveValues('me', raw, ['my-login', 'pw']);
    expect([...sensitive.phrases.keys()]).toContain('фамилия имя отчество');
    expect([...sensitive.phrases.keys()]).toContain(S1);
    expect([...sensitive.phrases.keys()]).toContain(W1);
    expect([...sensitive.phrases.keys()]).toContain('my-login');
    expect([...sensitive.phrases.keys()]).not.toContain('алгебра');
    expect([...sensitive.words.keys()]).toContain('тестовый');
    expect([...sensitive.numbers.keys()]).toContain('4711');
    expect(countLeaks([sanitize('me', raw)], sensitive)).toBe(0);
    expect(countLeaks([raw], sensitive)).toBeGreaterThan(5);
  });

  it('finds a name part inside a field sanitize() keeps, in any case', () => {
    const sensitive = sensitiveValues('lessons', { substitution: { teacher_fio: 'Сосновая Ирина Олеговна' } });
    expect(countLeaks([{ subject_title: 'Факультатив (СОСНОВАЯ И.О.)' }], sensitive)).toBe(1);
  });

  it('checks route keys too, and numbers as whole values', () => {
    const sensitive = sensitiveValues('url', { id: ['4711', S1] });
    expect(countLeaks([['GET /schools/4711/classes']], sensitive)).toBe(1);
    expect(countLeaks([{ date: 1791747110000 }], sensitive)).toBe(0);
  });
});

describe('second review: places, real values, keys', () => {
  it('a subject name is kept only on the subjects list itself, and never when it looks like a person', () => {
    const out = sanitize('subjects-1', [
      { uuid: S1, name: 'Математика', teacher: { uuid: W1, name: 'Иванова Мария Петровна' } },
      { uuid: W1, name: 'Факультатив (Сидоренко О.И.)' },
    ]);
    expect(out).toEqual([
      { uuid: fakeUuid(S1), name: 'Математика', teacher: { uuid: fakeUuid(W1), name: '[text]' } },
      { uuid: fakeUuid(W1), name: '[text]' },
    ]);
    expect(sanitize('lessons', [{ slots: [{ subject_title: 'Сидоренко Ольга Ивановна' }] }])).toEqual([
      { slots: [{ subject_title: '[text]' }] },
    ]);
  });

  it('marks keep their form but not their value, the class letter becomes a Cyrillic A, both stay stable', () => {
    const raw = [{ slots: [{ lesson_mark: { uuid: S1, mark: '7/9', kind: 'DOUBLE' } }] }];
    const once = sanitize('lessons-1-w1', raw) as [{ slots: [{ lesson_mark: { mark: string } }] }];
    expect(once[0].slots[0].lesson_mark.mark).toMatch(/^\d{1,2}\/\d{1,2}$/);
    expect(sanitize('lessons-1-w1', once)).toEqual(once);
    expect(sanitize('classes-1', [{ uuid: S1, label: 'Г', class_number: '7Г', level: 7 }])).toEqual([
      { uuid: fakeUuid(S1), label: 'А', class_number: '7А', level: 7 },
    ]);
  });

  it('fakes uuids inside keys and any key that is not a schema word; top-level strings are text', () => {
    const out = sanitize('final-1', { marks: { [`${S1}_FIRST_QUARTER`]: {}, 'Иванов Иван': {} } }) as {
      marks: Record<string, unknown>;
    };
    expect(Object.keys(out.marks).every((k) => k.startsWith('00000000-0000-4000-8000-'))).toBe(true);
    expect(sanitize('x', ['Иванов Иван Иванович'])).toEqual(['[text]']);
  });

  it('a leak names its source, never its value; fake uuid digits are not numbers from the response', () => {
    const sensitive = sensitiveValues('lessons-1-w1', [{ slots: [{ substitution: { fio: 'Сосновая Ирина' } }] }]);
    expect(findLeaks([{ subject_title: 'Сосновая' }], sensitive)).toEqual([
      'lessons-1-w1: [].slots[].substitution.fio',
    ]);
    const numbers = sensitiveValues('me', { code: 4000 });
    expect(findLeaks([{ id: fakeUuid('a') }], numbers)).toEqual([]);
  });
});

describe('third probe run: the forms real responses use', () => {
  it('keeps the year label in time_activities and the school year, fakes an id under the same key', () => {
    const ta = sanitize('time_activities', [
      { uuid: S1, school_year: '2026-2027' },
      { uuid: W1, school_year: S1 },
    ]);
    expect(ta).toEqual([
      { uuid: fakeUuid(S1), school_year: '2026-2027' },
      { uuid: fakeUuid(W1), school_year: fakeUuid(S1) },
    ]);
    expect(sanitize('school_year', { uuid: S1, label: '2026-2027' })).toEqual({
      uuid: fakeUuid(S1),
      label: '2026-2027',
    });
  });

  it('a year label that appears twice is not a leak', () => {
    const sensitive = sensitiveValues('time_activities', [{ school_year: '2026-2027' }]);
    sensitiveValues('school_year', { label: '2026-2027' }, [], sensitive);
    expect(findLeaks([sanitize('school_year', { label: '2026-2027' })], sensitive)).toEqual([]);
  });

  it("keeps the HH:MM:SS form of a start time, never the school's time", () => {
    expect(sanitize('lessons', [{ slots: [{ number: 2, start_time: '08:30:00' }] }])).toEqual([
      { slots: [{ number: 2, start_time: '08:55:00' }] },
    ]);
  });
});

describe('value forms', () => {
  it('show the format, never the value', async () => {
    const { shapeOf } = await import('./probe');
    expect(['08:30:00', '8:30', '2026/2027', 'Ника', null, 830].map(shapeOf)).toEqual([
      '99:99:99',
      '9:99',
      '9999/9999',
      'aaaa',
      'null',
      'number',
    ]);
    expect(shapeOf('a very long text that could be anything')).toBe('long');
  });
});

describe('--weeks', () => {
  it('defaults to 1, accepts 1 to 8, refuses anything else', () => {
    expect(weeksArg([])).toBe(1);
    expect(weeksArg(['--weeks', '6'])).toBe(6);
    expect(weeksArg(['--weeks', '8'])).toBe(MAX_WEEKS);
    for (const bad of [['--weeks'], ['--weeks', '0'], ['--weeks', '9'], ['--weeks', '2.5'], ['--weeks', 'six']])
      expect(weeksArg(bad), bad.join(' ')).toBeNull();
  });
});

describe('report', () => {
  it('has counts and enum values, never personal data', () => {
    const facts: ProbeFacts = {
      requests: 13,
      loginHasRefreshToken: true,
      students: 2,
      studentsWithoutMarksYear: 1,
      nameWords: [3, 3],
      terms: 4,
      holidays: 5,
      weeks: 36,
      weekLengths: [6, 7, 7],
      subjects: 25,
      lessons: [
        {
          externalId: S1,
          date: '2026-10-12',
          subjectExternalId: 's',
          subjectName: 'Алгебра',
          topic: 'Тема про кого-то',
          marks: [
            {
              externalId: 'm',
              date: '2026-10-12',
              subjectExternalId: 's',
              subjectName: 'Алгебра',
              raw: '8',
              kind: 'numeric',
              values: [8],
              comment: 'Хорошо!',
            },
          ],
        },
      ],
      finals: [],
      finalCells: 0,
      rawKinds: { SINGLE: 12, DOUBLE: 1 },
      rawWorkTypes: { null: 10, TEST: 3, [reportable('свободный текст')]: 1 },
      rawLessonTypes: { null: 20 },
      drift: [{ kind: 'unknown_field', endpoint: 'lessons', path: 'days[].slots[].new_field' }],
    };
    const text = report(facts);
    expect(text).toContain('Requests: 13');
    expect(text).toContain('[x] DOUBLE marks seen');
    expect(text).toContain('[ ] ABSENT marks seen');
    expect(text).toContain('other: 1');
    expect(text).toContain('unknown_field lessons days[].slots[].new_field');
    for (const secret of [S1, 'Алгебра', 'Тема про кого-то', 'Хорошо!', '2026-10-12', 'свободный текст'])
      expect(text).not.toContain(secret);
  });
});
