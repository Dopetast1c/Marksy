import type {
  AccountInfo,
  Attendance,
  BellSchedule,
  Calendar,
  Capabilities,
  DriftCheck,
  FinalMark,
  Lesson,
  LessonType,
  Mark,
  Subject,
  WeekTemplate,
  WorkType,
} from '@marksy/core';
import { holidayKind } from '@marksy/core';
import type {
  BellsRaw,
  FinalRow,
  LessonRaw,
  MarkRaw,
  ProfileResponse,
  SubjectRaw,
  TimetableRaw,
  YearResponse,
} from './api';

// Raw demo diary -> canonical types. The only place that knows the demo's field names and codes. What a provider's
// manifest does not promise is never returned (strip*), so demo-full and demo-lite share this code and differ by
// their capabilities only.

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
      ...(x.school_title && { schoolName: x.school_title }),
      classExternalId: x.class.id,
      className: x.class.title,
      grade: x.class.year,
    })),
  };
}

const remark = (r: string | undefined) => (r?.trim() ? { note: r.trim() } : {});

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
        ...remark(p.remark),
      })),
    holidays: y.breaks.map((b) => {
      const kind = holidayKind.safeParse(b.kind);
      return { from: b.from, to: b.till, ...remark(b.remark), ...(kind.success && { kind: kind.data }) };
    }),
    ...(!y.graded && { gradingScaleId: null }),
  };
}

const LEVELS: Record<string, Subject['level']> = { BASIC: 'regular', ADVANCED: 'advanced' };

export function mapSubjects(list: SubjectRaw[], check: DriftCheck): Subject[] {
  return list.map((s) => {
    const level =
      s.level && check.known(s.level, Object.keys(LEVELS), 'subjects[].level') ? LEVELS[s.level] : undefined;
    return {
      externalId: s.code,
      name: s.title,
      ...(s.short && { shortName: s.short }),
      ...(s.teacher && { teacherExternalId: s.teacher.id, teacherName: s.teacher.name }),
      ...(s.group && { groupLabel: s.group }),
      ...(level && { level }),
      ...(s.level_text && { levelLabel: s.level_text }),
      ...(s.per_week && { lessonsPerWeek: s.per_week }),
    };
  });
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
const TEXT_MARKS: Record<string, Mark['kind']> = {
  ['зач']: 'pass',
  ['незач']: 'fail',
  ['осв']: 'exempt',
  ['н/а']: 'not_assessed',
};
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
    ...(l.tpl && { templateRef: l.tpl }),
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

export function mapBells(list: BellsRaw[]): BellSchedule[] {
  return list.map((b) => ({
    externalId: b.code,
    ...(b.title && { label: b.title }),
    // the demo API counts weekdays from Monday = 1 and Sunday = 7; the model from Sunday = 0
    days: b.days.map((d) => d % 7),
    periods: b.periods.map((p) => ({ slot: p.n, start: p.from, end: p.till })),
  }));
}

export function mapTimetable(t: TimetableRaw): WeekTemplate {
  return {
    ...(t.term && { termExternalId: t.term }),
    cycleWeeks: 1,
    entries: t.week.map((e) => ({
      cycleWeek: 1,
      weekday: e.day % 7,
      slot: e.n,
      subjectExternalId: e.subject.code,
      subjectName: e.subject.title,
      ...(e.group && { groupLabel: e.group }),
      ...(e.room && { room: e.room }),
      ...(e.teacher && { teacherExternalId: e.teacher.id, teacherName: e.teacher.name }),
      ...(e.tpl && { templateRef: e.tpl }),
    })),
  };
}

// --- what the manifest promises -------------------------------------------------------------------------------

type Caps = Pick<
  Capabilities,
  'rooms' | 'teachingGroups' | 'teacherNames' | 'lessonTypes' | 'workTypes' | 'comments' | 'attendance'
>;

/** A copy without the keys the manifest does not promise */
function without<T extends object>(x: T, ...keys: (keyof T)[]): T {
  const out = { ...x };
  for (const k of keys) delete out[k];
  return out;
}

const teacherKeys = ['teacherName', 'teacherExternalId'] as const;

export function stripSubject(s: Subject, caps: Caps): Subject {
  return without(s, ...(caps.teacherNames ? [] : teacherKeys), ...(caps.teachingGroups ? [] : ['groupLabel' as const]));
}

export function stripLesson(l: Lesson, caps: Caps): Lesson {
  const marks = l.marks.map((m) =>
    without(
      m,
      ...(caps.workTypes ? [] : (['workType', 'workTypeRaw'] as const)),
      ...(caps.comments ? [] : ['comment' as const]),
    ),
  );
  return without(
    { ...l, marks },
    ...(caps.lessonTypes ? [] : ['lessonType' as const]),
    ...(caps.rooms ? [] : ['room' as const]),
    ...(caps.teachingGroups ? [] : ['groupLabel' as const]),
    ...(caps.teacherNames ? [] : teacherKeys),
    ...(caps.attendance === 'none' ? ['attendance' as const] : []),
  );
}

export function stripTemplate(t: WeekTemplate, caps: Caps): WeekTemplate {
  return {
    ...t,
    entries: t.entries.map((e) =>
      without(
        e,
        ...(caps.rooms ? [] : ['room' as const]),
        ...(caps.teachingGroups ? [] : ['groupLabel' as const]),
        ...(caps.teacherNames ? [] : teacherKeys),
      ),
    ),
  };
}
