import { addDays } from '@marksy/core';
import type { ISODate } from '@marksy/core';
import type { SeedCalendar, SeedStudent } from './school';
import { weekTemplateOf } from './school';

// The fictional school as responses of the fictional diary API: what a demo provider's fixtures/ hold. One pupil per
// rendering (p-1); the weeks to render are given, everything else is the pupil's year. scripts/write-fixtures.ts writes
// the result into a provider's fixtures folder, so the demo providers and the seed show the same school.

const LESSON_KINDS: Record<string, string> = { test: 'TEST', lab: 'LAB', practical: 'PRACTICAL', excursion: 'TRIP' };
const WORK_KINDS: Record<string, string> = {
  classwork: 'CLASS',
  homework: 'HOME',
  test: 'TEST',
  quiz: 'QUIZ',
  lab: 'LAB',
  essay: 'ESSAY',
  dictation: 'DICTATION',
  oral: 'ORAL',
};
/** The demo API counts weekdays Monday = 1 to Sunday = 7 */
const apiDay = (weekday: number) => (weekday === 0 ? 7 : weekday);

export interface RenderOptions {
  /** Monday of every week whose diary is rendered */
  weeks: ISODate[];
  /** The term the regular week is for */
  termCode: string;
  schoolTitle?: string;
}

export interface RenderedFixtures {
  fixtures: Record<string, unknown>;
  routes: Record<string, string>;
}

export function renderFixtures(student: SeedStudent, cal: SeedCalendar, opts: RenderOptions): RenderedFixtures {
  const code = new Map(student.subjects.map((s, i) => [s.name, `s${i + 1}`]));
  const teachers = [...new Set(student.subjects.map((s) => s.teacher).filter((t): t is string => !!t))].sort();
  const teacher = (name: string | null) => (name ? { id: `T-${teachers.indexOf(name) + 1}`, name } : null);
  const subject = (name: string) => ({ code: code.get(name)!, title: name });

  const fixtures: Record<string, unknown> = {
    auth: { access_token: 'demo-token' },
    profile: {
      user_id: 'U-1',
      display_name: 'Родитель',
      pupils: [
        {
          pupil_id: 'p-1',
          name: { first: 'Ученик А', last: 'Пример' },
          school: 'S-1',
          ...(opts.schoolTitle && { school_title: opts.schoolTitle }),
          class: { id: 'C-1', title: student.classLabel, year: student.grade },
        },
      ],
    },
    'year-1': {
      year: { code: cal.year.label, title: cal.year.label.replace('-', '/'), from: cal.year.start, till: cal.year.end },
      periods: cal.terms.map((t) => ({
        code: `q${t.index}`,
        kind: 'QUARTER',
        n: t.index,
        from: t.start,
        till: t.end,
        ...(t.note && { remark: t.note }),
      })),
      breaks: cal.holidays.map((h) => ({ from: h.from, till: h.to, ...(h.note && { remark: h.note }) })),
      graded: student.scale !== null,
    },
    'subjects-1': student.subjects.map((s) => ({
      ...subject(s.name),
      teacher: teacher(s.teacher),
      group: s.group,
      level: s.level ? 'ADVANCED' : 'BASIC',
      level_text: s.level ?? 'Базовый',
      per_week: s.slots.length,
    })),
    'bells-1': [
      {
        code: 'B-1',
        title: student.bells.label,
        days: student.bells.days.map(apiDay),
        periods: student.bells.periods.map((p) => ({ n: p.slot, from: p.start, till: p.end })),
      },
    ],
    'timetable-1': {
      term: opts.termCode,
      week: weekTemplateOf(student).map((e) => ({
        day: apiDay(e.weekday),
        n: e.slot,
        tpl: e.templateRef,
        subject: subject(e.subject),
        group: e.group,
        room: e.room,
        teacher: teacher(e.teacher),
      })),
    },
  };
  const routes: Record<string, string> = {
    'POST /api/v2/auth': 'auth',
    'GET /api/v2/profile': 'profile',
    'GET /api/v2/pupils/p-1/year': 'year-1',
    'GET /api/v2/pupils/p-1/subjects': 'subjects-1',
    'GET /api/v2/pupils/p-1/bells': 'bells-1',
    'GET /api/v2/pupils/p-1/timetable': 'timetable-1',
  };

  opts.weeks.forEach((monday, i) => {
    const name = `diary-1-w${i + 1}`;
    const days = [];
    for (let d = monday; d <= addDays(monday, 6); d = addDays(d, 1)) {
      const lessons = student.lessons
        .filter((l) => l.date === d)
        .map((l) => ({
          uid: `L-${l.key}`,
          n: l.slot,
          starts: l.startTime,
          subject: subject(l.subject),
          topic: l.topic,
          homework: l.homework,
          kind: l.lessonType ? LESSON_KINDS[l.lessonType]! : null,
          tpl: l.templateRef,
          marks: [
            ...student.marks
              .filter((m) => m.lessonKey === l.key)
              .map((m) => ({
                uid: `M-${m.key}`,
                value: m.raw,
                type: m.workType ? WORK_KINDS[m.workType]! : null,
                note: m.comment,
              })),
            ...(student.absences.includes(l.key) ? [{ uid: `A-${l.key}`, value: 'н', type: null, note: null }] : []),
          ],
        }));
      if (lessons.length) days.push({ date: d, lessons });
    }
    fixtures[name] = { week: monday, days };
    routes[`GET /api/v2/pupils/p-1/diary?week=${monday}`] = name;
  });
  fixtures['diary-empty'] = { week: '', days: [] };
  routes['GET /api/v2/pupils/*/diary'] = 'diary-empty';
  return { fixtures, routes };
}
