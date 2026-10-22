import type {
  AccountInfo,
  Attendance,
  Calendar,
  FinalMark,
  Lesson,
  LessonType,
  Mark,
  Subject,
  WorkType,
} from '@marksy/core';
import type { DriftCheck } from '@marksy/core';
import type { FinalRow, LessonRaw, MarkRaw, ProfileResponse, YearResponse } from './schemas';

// Raw demo diary -> canonical types. The only place that knows the demo's field names and codes.

export function mapAccount(p: ProfileResponse): AccountInfo {
  return {
    externalUserId: p.user_id,
    displayName: p.display_name,
    role: 'parent',
    students: p.pupils.map((x) => ({
      externalId: x.pupil_id,
      fullName: `${x.name.last} ${x.name.first}`,
      givenName: x.name.first,
      familyName: x.name.last,
      schoolId: x.school,
      classExternalId: x.class.id,
      className: x.class.title,
      grade: x.class.year,
    })),
  };
}

export function mapCalendar(y: YearResponse, check: DriftCheck): Calendar {
  return {
    schoolYear: { externalId: y.year.code, label: y.year.title, start: y.year.from, end: y.year.till },
    terms: y.periods
      .filter((p) => check.known(p.kind, ['QUARTER'], 'periods[].kind'))
      .map((p) => ({
        externalId: p.code,
        kind: 'quarter' as const,
        index: p.n,
        label: String(p.n),
        start: p.from,
        end: p.till,
      })),
    holidays: y.breaks.map((b) => ({ from: b.from, to: b.till })),
    ...(!y.graded && { gradingScaleId: null }),
  };
}

export function mapSubjects(list: { code: string; title: string }[]): Subject[] {
  return list.map((s) => ({ externalId: s.code, name: s.title }));
}

const WORK_TYPES: Record<string, WorkType> = {
  CLASS: 'classwork',
  HOME: 'homework',
  TEST: 'test',
  QUIZ: 'quiz',
  LAB: 'lab',
  ESSAY: 'essay',
  DICTATION: 'dictation',
  ORAL: 'oral',
};
const LESSON_TYPES: Record<string, LessonType> = {
  TEST: 'test',
  LAB: 'lab',
  PRACTICAL: 'practical',
  TRIP: 'excursion',
};
/** Cell texts that are not numbers: what they mean on the canonical model */
const TEXT_MARKS: Record<string, Mark['kind']> = { зач: 'pass', незач: 'fail', осв: 'exempt', 'н/а': 'not_assessed' };
const ABSENT = 'н';

/** The lesson's id, or one built from the slot while the diary has none yet (the collector matches both) */
export const lessonId = (date: string, l: LessonRaw) => l.uid ?? `slot:${date}:${l.n}:${l.subject.code}`;

function mapMark(m: MarkRaw, date: string, l: LessonRaw, check: DriftCheck): Mark {
  const numeric = /^\d{1,2}(\/\d{1,2})?$/.test(m.value);
  const textKind = TEXT_MARKS[m.value];
  if (!numeric && !textKind) check.known(m.value, [], 'days[].lessons[].marks[].value');
  const work = m.type && check.known(m.type, Object.keys(WORK_TYPES), 'days[].lessons[].marks[].type');
  return {
    externalId: m.uid,
    date,
    subjectExternalId: l.subject.code,
    subjectName: l.subject.title,
    lessonExternalId: lessonId(date, l),
    raw: m.value,
    kind: numeric ? 'numeric' : (textKind ?? 'other'),
    values: numeric ? m.value.split('/').map(Number) : [],
    ...(m.type && { workType: work ? WORK_TYPES[m.type]! : 'other', workTypeRaw: m.type }),
    ...(m.note && { comment: m.note }),
  };
}

export function mapLesson(date: string, l: LessonRaw, check: DriftCheck): Lesson {
  const id = lessonId(date, l);
  const marks: Mark[] = [];
  const attendance: Attendance[] = [];
  for (const m of l.marks) {
    // an absence sits in the mark cell but is never a mark
    if (m.value === ABSENT) {
      attendance.push({
        externalId: `att:${m.uid}`,
        date,
        lessonExternalId: id,
        subjectExternalId: l.subject.code,
        status: 'absent',
        code: ABSENT,
      });
    } else marks.push(mapMark(m, date, l, check));
  }
  const type =
    l.kind && check.known(l.kind, Object.keys(LESSON_TYPES), 'days[].lessons[].kind')
      ? LESSON_TYPES[l.kind]
      : undefined;
  return {
    externalId: id,
    date,
    slot: l.n,
    ...(l.starts && { startTime: l.starts }),
    subjectExternalId: l.subject.code,
    subjectName: l.subject.title,
    ...(l.topic && { topic: l.topic }),
    ...(l.homework && { homework: l.homework }),
    ...(type && { lessonType: type }),
    marks,
    ...(attendance.length > 0 && { attendance }),
  };
}

export function mapFinal(r: FinalRow): FinalMark {
  const numeric = /^\d{1,2}$/.test(r.value);
  return {
    subjectExternalId: r.subject.code,
    subjectName: r.subject.title,
    termExternalId: r.period,
    raw: r.value,
    value: numeric ? Number(r.value) : null,
    kind: numeric ? 'numeric' : (TEXT_MARKS[r.value] ?? 'other'),
    role: 'final',
  };
}
