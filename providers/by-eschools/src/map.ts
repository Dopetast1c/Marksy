import type {
  AccountInfo,
  Attendance,
  BehaviourEvent,
  Calendar,
  DriftCheck,
  FinalMark,
  Lesson,
  LessonType,
  Mark,
  MarkKind,
  StudentRef,
  Subject,
  Term,
  WorkType,
  HolidayKind,
} from '@marksy/core';
import { ProviderSchemaError } from '@marksy/core';
import { dayRange, toISODate } from './dates';
import {
  educationalSubject,
  finalMarkCell,
  LESSON_TYPES,
  MARK_KINDS,
  HOLIDAY_KINDS,
  QUARTER_TITLES,
  slot as slotSchema,
  TIME_ACTIVITY_TYPES,
  WORK_TYPES,
  lessonsDay,
} from './schemas';
import type {
  FinalWholeResponse,
  LessonMark,
  LessonsDay,
  MeResponse,
  SchoolClass,
  SchoolYearResponse,
  Slot,
  TimeActivity,
} from './schemas';

// Raw e-schools.by -> canonical types. The only place that knows the system's field names and enum values.

/** Belarusian grades 1 and 2 get no marks (docs/api-spec.md 5): their school year has no grading scale (ux D49). */
export const LAST_UNMARKED_GRADE = 2;
/**
 * ADDITIONAL_HOLIDAYS (a February week inside the third quarter) are holidays only up to this grade; for older
 * grades those days are school days (docs/api-spec.md 6.4). The diary says so only in prose, so it is a rule here.
 */
export const LAST_GRADE_WITH_ADDITIONAL_HOLIDAYS = 2;
const ADDITIONAL_HOLIDAYS = 'ADDITIONAL_HOLIDAYS';

const LESSON_TYPE: Record<(typeof LESSON_TYPES)[number], LessonType> = {
  TEST: 'test',
  LABORATORY_WORK: 'lab',
  PRACTICAL_WORK: 'practical',
  EXCURSION: 'excursion',
  INDEPENDENT_WORK: 'other',
};

const WORK_TYPE: Record<(typeof WORK_TYPES)[number], WorkType> = {
  CLASSWORK: 'classwork',
  HOMEWORK: 'homework',
  PRACTICAL_WORK: 'practical',
  LABORATORY_WORK: 'lab',
  CREATIVE_WORK: 'other',
  SUMMARY: 'other',
  DICTATION: 'dictation',
  TEST: 'test',
  INDEPENDENT_WORK: 'quiz',
  ESSAY: 'essay',
  KNOWLEDGE_CONTROL: 'test',
  BY_HEART: 'other',
  TRANSLATION: 'other',
};

const MARK_KIND: Record<Exclude<(typeof MARK_KINDS)[number], 'ABSENT'>, MarkKind> = {
  SINGLE: 'numeric',
  DOUBLE: 'numeric',
  PASS: 'pass',
  NOT_PASS: 'fail',
  EXEMPT: 'exempt',
  MASTERED: 'pass',
  NOT_MASTERED: 'fail',
  NOT_TAKEN: 'not_assessed',
};

/** What the official diary prints in the mark cell when `mark` is empty (docs/api-spec.md 7.2). */
const KIND_LABEL: Record<string, string> = {
  ABSENT: 'н',
  PASS: 'зач.',
  NOT_PASS: 'незач.',
  EXEMPT: 'освоб.',
  MASTERED: 'осв.',
  NOT_MASTERED: 'не осв.',
  NOT_TAKEN: 'н/а',
};

const nonEmpty = (s: string | null | undefined) => (s && s.trim() ? s : undefined);
/** The description of a term or a holiday is a note for people ("for the students of grade 9 …"), kept as it is */
const noteOf = (a: { description?: string | null }) => {
  const note = nonEmpty(a.description)?.trim();
  return note ? { note } : {};
};
const is = <T extends string>(list: readonly T[], v: string | null | undefined): v is T =>
  v != null && (list as readonly string[]).includes(v);

/** The class the student is in now: not disbanded, or the first one. */
export function currentClass(classes: readonly SchoolClass[]): SchoolClass | undefined {
  return classes.find((c) => c.dt_disbanded == null) ?? classes[0];
}

export function mapStudent(s: MeResponse['students_for_parent'][number], cls: SchoolClass | undefined): StudentRef {
  const className = nonEmpty(cls?.class_number) ?? (cls?.level != null ? `${cls.level}${cls.label ?? ''}` : undefined);
  return {
    externalId: s.profile_id,
    fullName: s.full_name,
    schoolId: s.school_id,
    ...(cls && { classExternalId: cls.uuid }),
    ...(className && { className }),
    ...(cls?.level != null && { grade: cls.level }),
  };
}

export function mapAccount(me: MeResponse, classes: ReadonlyMap<string, SchoolClass | undefined>): AccountInfo {
  return {
    externalUserId: me.user_id,
    displayName: nonEmpty(me.full_name) ?? null,
    role: 'parent',
    students: me.students_for_parent.map((s) => mapStudent(s, classes.get(s.profile_id))),
  };
}

/** The kind of a holidays item from its title (api-spec 6.4); an unknown title is "other" and recorded as drift */
function holidayKindOf(title: string, check: DriftCheck): HolidayKind {
  const known = Object.keys(HOLIDAY_KINDS);
  return check.known(title, known, 'time_activities[].title')
    ? HOLIDAY_KINDS[title as keyof typeof HOLIDAY_KINDS]
    : 'other';
}

export function mapCalendar(
  year: SchoolYearResponse,
  activities: readonly TimeActivity[],
  student: Pick<StudentRef, 'grade'>,
  timeZone: string,
  check: DriftCheck,
): Calendar {
  const range = (a: TimeActivity) => dayRange({ start: a.start_date, end: a.end_date }, timeZone);
  const quarters = activities
    .filter((a) => check.known(a.type, TIME_ACTIVITY_TYPES, 'time_activities[].type') && a.type === 'QUARTER')
    .sort((a, b) => a.start_date - b.start_date);
  const terms: Term[] = quarters.map((q, i) => {
    check.known(q.title, QUARTER_TITLES, 'time_activities[].title');
    const byTitle = (QUARTER_TITLES as readonly string[]).indexOf(q.title);
    const { from, to } = range(q);
    return {
      externalId: q.uuid,
      kind: 'quarter',
      index: byTitle >= 0 ? byTitle + 1 : i + 1,
      label: q.title,
      start: from,
      end: to,
      ...noteOf(q),
    };
  });
  // an unknown grade gets no extra holidays: a week of school days shown as such is safer than lessons hidden
  const youngest = student.grade != null && student.grade <= LAST_GRADE_WITH_ADDITIONAL_HOLIDAYS;
  const holidays = activities
    .filter((a) => a.type === 'HOLIDAYS' && (a.title !== ADDITIONAL_HOLIDAYS || youngest))
    .map((a) => ({ ...range(a), ...noteOf(a), kind: holidayKindOf(a.title, check) }));
  const yearRange = dayRange({ start: year.start_ts, end: year.end_ts }, timeZone);
  return {
    schoolYear: {
      externalId: year.uuid,
      label:
        nonEmpty(year.label) ??
        (year.start_year && year.end_year ? `${year.start_year}/${year.end_year}` : yearRange.from.slice(0, 4)),
      start: yearRange.from,
      end: yearRange.to,
    },
    terms,
    ...(holidays.length && { holidays }),
    ...(student.grade != null && student.grade <= LAST_UNMARKED_GRADE && { gradingScaleId: null }),
  };
}

export function mapSubjects(raw: unknown, check: DriftCheck): Subject[] {
  return check
    .items(educationalSubject, raw, 'educational_subjects')
    .map((s) => ({ externalId: s.uuid, name: s.name }));
}

interface MappedCell {
  mark?: Mark;
  attendance?: Attendance;
  remark?: BehaviourEvent;
}

/**
 * The lesson's id. Real responses sometimes have lesson_uuid = null (api-spec 6.8); the id is then built from what
 * identifies the lesson within the student's week: date, lesson number (or start time) and subject. The server
 * matches lessons by this id and, when ids differ, by (student, date, slot, subject) (design.md 8), so a lesson that
 * later gets a real uuid is the same lesson, not a removal plus a new one.
 */
export function lessonIdOf(s: Slot, date: string): string {
  return s.lesson_uuid ?? `slot:${date}:${s.number ?? s.start_time ?? '-'}:${s.subject_id}`;
}

/** "8:30", "08:30" or "08:30:00" -> "08:30"; anything that is not a time of day -> undefined. */
export function timeOf(value: string | null | undefined): string | undefined {
  const m = value?.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m ? `${m[1]!.padStart(2, '0')}:${m[2]}` : undefined;
}

/** A lesson_mark: a mark, or for ABSENT an attendance record (absences are never marks). */
export function mapLessonMark(m: LessonMark, s: Slot, date: string, check: DriftCheck): MappedCell {
  check.known(m.kind, MARK_KINDS, 'lesson_mark.kind');
  const raw = nonEmpty(m.mark) ?? (m.kind ? (KIND_LABEL[m.kind] ?? m.kind) : '');
  if (m.kind === 'ABSENT') {
    return {
      attendance: {
        externalId: m.uuid,
        date,
        lessonExternalId: lessonIdOf(s, date),
        subjectExternalId: s.subject_id,
        status: 'absent',
        code: raw,
      },
    };
  }
  let kind: MarkKind = is(MARK_KINDS, m.kind) ? MARK_KIND[m.kind as keyof typeof MARK_KIND] : 'other';
  // "7/9" is two marks; each value counts once in averages (api-spec 7.4)
  const values = kind === 'numeric' ? (m.mark ?? '').split('/').map(Number).filter(Number.isFinite) : [];
  if (kind === 'numeric' && !values.length) kind = 'other';
  check.known(m.type, WORK_TYPES, 'lesson_mark.type');
  const workType = is(WORK_TYPES, m.type) ? WORK_TYPE[m.type] : m.type ? 'other' : undefined;
  return {
    mark: {
      externalId: m.uuid,
      date,
      subjectExternalId: s.subject_id,
      subjectName: s.subject_title,
      lessonExternalId: lessonIdOf(s, date),
      raw,
      kind,
      values,
      ...(workType && { workType }),
      ...(m.type && { workTypeRaw: m.type }),
      ...(nonEmpty(m.comment) && { comment: m.comment!.trim() }),
      ...(nonEmpty(m.author) && { authorExternalId: m.author! }),
    },
  };
}

export function mapLesson(s: Slot, date: string, check: DriftCheck): Lesson {
  check.known(s.type, LESSON_TYPES, 'slots[].type');
  const m = s.lesson_mark;
  const cell: MappedCell =
    m && (m.kind || nonEmpty(m.mark))
      ? mapLessonMark(m, s, date, check)
      : m && nonEmpty(m.comment)
        ? { remark: remarkOf(m, s, date) }
        : {};
  return {
    externalId: lessonIdOf(s, date),
    date,
    ...(s.number != null && { slot: s.number }),
    ...(timeOf(s.start_time) && { startTime: timeOf(s.start_time)! }),
    subjectExternalId: s.subject_id,
    subjectName: s.subject_title,
    ...(nonEmpty(s.teacher_id) && { teacherExternalId: s.teacher_id! }),
    // the server matches the lesson to the student's regular week with it: room, subgroup, teacher (providers.md 4)
    ...(nonEmpty(s.lesson_template_id) && { templateRef: s.lesson_template_id! }),
    ...(nonEmpty(s.topic) && { topic: s.topic!.trim() }),
    ...(nonEmpty(s.homework) && { homework: s.homework!.trim() }),
    ...(s.has_attachments_or_links != null && { hasAttachments: s.has_attachments_or_links }),
    ...(is(LESSON_TYPES, s.type) && { lessonType: LESSON_TYPE[s.type] }),
    marks: cell.mark ? [cell.mark] : [],
    ...(cell.attendance && { attendance: [cell.attendance] }),
    ...(cell.remark && { behaviour: [cell.remark] }),
  };
}

/**
 * A lesson_mark with neither a kind nor a mark, only a comment: the teacher's remark on the lesson ("no homework done";
 * api-spec 7.2). No mark is made; the diary says nothing of its tone, so it is neutral.
 */
function remarkOf(m: LessonMark, s: Slot, date: string): BehaviourEvent {
  return {
    externalId: m.uuid,
    date,
    polarity: 'neutral',
    category: 'lesson_comment',
    comment: m.comment!.trim(),
    subjectExternalId: s.subject_id,
    lessonExternalId: lessonIdOf(s, date),
    ...(nonEmpty(m.author) && { authorExternalId: m.author! }),
  };
}

/**
 * One week's response (six days) -> lessons. A slot that cannot be parsed is reported, and the week cannot be used:
 * skipping it would make the collector take its lesson and marks for removed (the week stays unverified instead).
 */
export function mapLessonsWeek(days: readonly LessonsDay[], timeZone: string, check: DriftCheck): Lesson[] {
  return days.flatMap((day) => {
    const date = toISODate(day.date, timeZone);
    const slots = check.items(slotSchema, day.slots, 'days[].slots');
    if (slots.length !== day.slots.length)
      throw new ProviderSchemaError('lessons: a lesson in this week cannot be read');
    return slots.map((s) => mapLesson(s, date, check));
  });
}

/** A whole lessons response (6.8): a day that cannot be read makes the week unusable, like a slot (see above) */
export function mapLessonsResponse(raw: unknown, timeZone: string, check: DriftCheck): Lesson[] {
  const days = check.items(lessonsDay, raw, 'days');
  if (!Array.isArray(raw) || days.length !== raw.length)
    throw new ProviderSchemaError('lessons: a day in this week cannot be read');
  return mapLessonsWeek(days, timeZone, check);
}

/** Words of a final-marks period key that mean the whole year (provisional: the populated shape is unverified). */
const YEAR_KEY = /year|annual|whole|^god$/i;

/**
 * final/whole -> FinalMark[]. Provisional (docs/api-spec.md 6.9): marks[subjectId][period] = { mark, kind }, period
 * being a quarter's time_activity uuid or a year key. Unknown periods and cells are reported as drift and skipped.
 */
export function mapFinals(
  raw: FinalWholeResponse,
  subjects: readonly Subject[],
  terms: readonly Term[],
  check: DriftCheck,
): FinalMark[] {
  const names = new Map(subjects.map((s) => [s.externalId, s.name]));
  const termIds = new Set(terms.map((t) => t.externalId));
  const out: FinalMark[] = [];
  for (const [subjectId, periods] of Object.entries(raw.marks)) {
    for (const [period, value] of Object.entries(periods)) {
      const isTerm = termIds.has(period);
      if (!isTerm && !YEAR_KEY.test(period)) {
        check.known(period, [], 'final.marks.*.period');
        continue;
      }
      const cell = check.items(finalMarkCell, [value], 'final.marks.*.*')[0];
      if (!cell) continue;
      check.known(cell.kind, MARK_KINDS, 'final.marks.*.*.kind');
      const rawMark = nonEmpty(cell.mark) ?? (cell.kind ? (KIND_LABEL[cell.kind] ?? cell.kind) : '');
      const numeric = /^\d+$/.test(rawMark.trim());
      out.push({
        subjectExternalId: subjectId,
        subjectName: names.get(subjectId) ?? subjectId,
        termExternalId: isTerm ? period : null,
        raw: rawMark,
        value: numeric ? Number(rawMark) : null,
        kind: numeric
          ? 'numeric'
          : is(MARK_KINDS, cell.kind) && cell.kind !== 'ABSENT'
            ? MARK_KIND[cell.kind as keyof typeof MARK_KIND]
            : 'other',
        role: 'final',
      });
    }
  }
  return out;
}
