import { describe, expect, it } from 'vitest';
import { countLeaks, endpointName, report, sanitisedRoute, sensitiveStrings } from './probe';
import { fakeUuid, sanitize } from './sanitize';
import type { ProbeFacts } from './probe';

const S1 = '2b8c4d6e-1f3a-4b5c-8d7e-9f0a1b2c3d4e';
const W1 = '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f';
const D = 'https://diary.example.com/api/v1/education/diary';

describe('probe helpers', () => {
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

  it('routes use the same fake ids as sanitize()', () => {
    const route = sanitisedRoute(
      'GET',
      new URL(`${D}/schools/s/classes/c/students/${S1}/lessons?week_activity_uuid=${W1}`),
    );
    expect(route).toBe(
      `GET /api/v1/education/diary/schools/s/classes/c/students/${fakeUuid(S1)}/lessons?week_activity_uuid=${fakeUuid(W1)}`,
    );
    const raw = { profile_id: S1 };
    expect((sanitize('me', raw) as { profile_id: string }).profile_id).toBe(fakeUuid(S1));
  });

  it('finds every id, name, text and token, and counts what survives', () => {
    const raw = {
      full_name: 'Фамилия Имя Отчество',
      students_for_parent: [{ profile_id: S1, full_name: 'Ребёнок Тестовый' }],
      days: [
        {
          slots: [
            { topic: 'Тема про кого-то', subject_title: 'Алгебра', lesson_mark: { mark: '8', comment: 'Хорошо!' } },
          ],
        },
      ],
      marks: { [W1]: {} },
    };
    const sensitive = sensitiveStrings(raw, ['my-login', 'pw']);
    expect([...sensitive].sort()).toEqual(
      ['Фамилия Имя Отчество', S1, 'Ребёнок Тестовый', 'Тема про кого-то', 'Хорошо!', W1, 'my-login'].sort(),
    );
    expect(countLeaks([sanitize('lessons', raw)], sensitive)).toBe(0);
    expect(countLeaks([raw], sensitive)).toBe(sensitive.size - 1);
  });

  it('the report has counts and enum values, never personal data', () => {
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
      rawWorkTypes: { null: 10, TEST: 3 },
      rawLessonTypes: { null: 20 },
      drift: [{ kind: 'unknown_field', endpoint: 'lessons', path: 'days[].slots[].new_field' }],
    };
    const text = report(facts);
    expect(text).toContain('Requests: 13');
    expect(text).toContain('[x] DOUBLE marks seen');
    expect(text).toContain('[ ] ABSENT marks seen');
    expect(text).toContain('unknown_field lessons days[].slots[].new_field');
    for (const secret of [S1, 'Алгебра', 'Тема про кого-то', 'Хорошо!', '2026-10-12'])
      expect(text).not.toContain(secret);
  });
});
