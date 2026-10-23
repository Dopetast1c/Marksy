import type { BellSchedule, DriftCheck, Subject, Term, WeekTemplate } from '@marksy/core';
import { timeOf } from './map';
import { HALF_YEAR_TITLES, PARTITION_TYPES, QUARTER_TITLES, TIMETABLE_PERIODS } from './schemas';
import type { BellScheduleRaw, ClassTimetable, PlanningSubject, Premise, StudentSubjectRow } from './schemas';

// School details of one student (docs/api-spec.md 6.7a, 6.10 and 7.5): the class's bells, timetable, teaching plan and
// the school's rooms come in whole; only what belongs to the student leaves here. The student's teaching groups follow
// from their own lessons (lesson_template_id; teacher_id only for a lesson without one, since a substitute teacher
// may be the other group's): a split subject with no lesson seen, or with lessons that point to two groups, has no
// group and no teacher. Teachers of other groups and the school's room list are never returned.

/**
 * What the student's own lessons say about their groups: the templates they came from, and per subject the teachers
 * who gave the lessons that name no template (a teacher of the student's group in one subject may teach the other
 * group in another)
 */
export interface LessonRefs {
  templates: ReadonlySet<string>;
  teachers: ReadonlyMap<string, ReadonlySet<string>>;
}

const taughtBy = (refs: LessonRefs, subjectId: string, teacherId: string | null | undefined) =>
  !!teacherId && !!refs.teachers.get(subjectId)?.has(teacherId);

const LEVELS: Record<string, Subject['level']> = {
  Базовый: 'regular',
  Углубленный: 'advanced',
  Углублённый: 'advanced',
};
/** e-schools counts weekdays Monday = 1 to Sunday = 7; the model from Sunday = 0 */
const weekday = (d: number) => d % 7;
const clean = (s: string | null | undefined) => (s && s.trim() ? s.trim() : undefined);

/**
 * The templates the student is in: a subject's templates when the class learns it whole (CLASS, or a single template),
 * otherwise the group templates their lessons came from, and only when those are of one group. Fails closed: a
 * missing or new partition type, a template without its group, or evidence for two groups gives nothing.
 */
export function studentTemplates(planning: readonly PlanningSubject[], refs: LessonRefs): Set<string> {
  const out = new Set<string>();
  for (const subject of planning) {
    const templates = subject.templates ?? [];
    if (subject.partition_type === 'CLASS' || templates.length === 1) {
      for (const t of templates) out.add(t.uuid);
      continue;
    }
    const seen = templates.filter((t) => refs.templates.has(t.uuid) || taughtBy(refs, subject.uuid, t.teacher?.id));
    const groups = new Set(seen.map((t) => t.study_group?.uuid ?? null));
    if (groups.size === 1 && !groups.has(null)) for (const t of seen) out.add(t.uuid);
  }
  return out;
}

const DAY = 86_400_000;
type Quarter = Pick<Term, 'kind' | 'index' | 'start' | 'end'>;

/** The days a timetable's period spans, from the school year's quarters; a half year is two quarters */
function periodRange(period: string | null | undefined, terms: readonly Quarter[]) {
  const q = (QUARTER_TITLES as readonly string[]).indexOf(period ?? '');
  const h = (HALF_YEAR_TITLES as readonly string[]).indexOf(period ?? '');
  const indexes = q >= 0 ? [q + 1] : h >= 0 ? [2 * h + 1, 2 * h + 2] : [];
  const quarters = terms.filter((t) => t.kind === 'quarter' && indexes.includes(t.index));
  if (indexes.length === 0 || quarters.length !== indexes.length) return undefined;
  const start = quarters.map((t) => t.start).sort()[0]!;
  const end = quarters
    .map((t) => t.end)
    .sort()
    .at(-1)!;
  return { start, end, days: (Date.parse(end) - Date.parse(start)) / DAY };
}

/**
 * The class's regular week today (6.10.2): of the timetables the class has (a quarter's, a half year's), the one whose
 * period covers today, the narrower when both do; between periods the next one to start, after the last the latest.
 */
export function pickTimetable(
  items: readonly ClassTimetable[],
  terms: readonly Quarter[],
  today: string,
  check: DriftCheck,
): ClassTimetable | undefined {
  for (const t of items) if (t.period) check.known(t.period, TIMETABLE_PERIODS, 'timetables[].period');
  if (items.length <= 1) return items[0];
  const ranged = items
    .map((t) => ({ t, r: periodRange(t.period, terms) }))
    .filter((x): x is { t: ClassTimetable; r: NonNullable<typeof x.r> } => !!x.r);
  const covering = ranged.filter((x) => x.r.start <= today && today <= x.r.end);
  const next = ranged.filter((x) => x.r.start > today);
  const pick =
    covering.sort((a, b) => a.r.days - b.r.days)[0] ??
    next.sort((a, b) => a.r.start.localeCompare(b.r.start) || a.r.days - b.r.days)[0] ??
    ranged.sort((a, b) => b.r.end.localeCompare(a.r.end) || a.r.days - b.r.days)[0];
  return pick?.t ?? items[0];
}

/** The class's bell schedule (named by its timetable), one canonical schedule per group of weekdays */
export function mapBellSchedules(
  schedules: readonly BellScheduleRaw[],
  timetable: ClassTimetable | undefined,
  grade: number | undefined,
): BellSchedule[] {
  const named = schedules.find((s) => s.uuid === timetable?.schedule_of_bells_uuid);
  // without a timetable, only a schedule that is the one for this grade; two shifts would be a guess
  const forGrade = schedules.filter((s) => grade != null && s.levels?.includes(grade));
  const schedule = named ?? (forGrade.length === 1 ? forGrade[0] : undefined);
  if (!schedule) return [];
  return schedule.days_of_week
    .map((group, i) => ({
      externalId: schedule.days_of_week.length > 1 ? `${schedule.uuid}:${i + 1}` : schedule.uuid,
      ...(clean(schedule.title) && { label: clean(schedule.title)! }),
      days: group.days.map(weekday),
      periods: group.time_of_bells
        .map((b) => ({ slot: b.number, start: timeOf(b.start_time), end: timeOf(b.end_time) }))
        .filter((p): p is { slot: number; start: string; end: string } => !!p.start && !!p.end)
        .sort((a, b) => a.slot - b.slot),
    }))
    .filter((b) => b.days.length > 0 && b.periods.length > 0);
}

/** "Иванова Мария Петровна" as 6.7a gives it, for the student's own teacher only */
function teacherOf(rows: readonly StudentSubjectRow[], id: string | null | undefined) {
  const row = id ? rows.find((r) => r.teacher_id === id && clean(r.teacher)) : undefined;
  return row ? { teacherExternalId: row.teacher_id!, teacherName: clean(row.teacher)! } : {};
}

export function mapWeekTemplate(
  timetable: ClassTimetable,
  planning: readonly PlanningSubject[],
  rows: readonly StudentSubjectRow[],
  premises: readonly Premise[],
  mine: ReadonlySet<string>,
  terms: readonly Pick<Term, 'externalId' | 'index'>[],
  subjectNames: ReadonlyMap<string, string>,
): WeekTemplate {
  const byTemplate = new Map(
    planning.flatMap((subject) => (subject.templates ?? []).map((t) => [t.uuid, { subject, template: t }] as const)),
  );
  const rooms = new Map(premises.map((p) => [p.uuid, clean(p.audience_number)]));
  // a quarter's timetable belongs to that term; a half year's to none (it spans two)
  const termIndex = (QUARTER_TITLES as readonly string[]).indexOf(timetable.period ?? '');
  const term = termIndex >= 0 ? terms.find((t) => t.index === termIndex + 1) : undefined;
  const entries: WeekTemplate['entries'] = [];
  for (const day of timetable.days_of_week) {
    for (const ts of day.timetable_slots) {
      for (const slot of ts.slots) {
        const ref = slot.lesson_template_id;
        const found = ref && mine.has(ref) ? byTemplate.get(ref) : undefined;
        if (!found) continue; // another group's lesson, or a slot without a template
        const number = slot.number ?? ts.time_of_bells?.number;
        if (number == null) continue;
        const start = timeOf(ts.time_of_bells?.start_time);
        const end = timeOf(ts.time_of_bells?.end_time);
        const room = slot.room_id ? rooms.get(slot.room_id) : undefined;
        const group = clean(found.template.study_group?.name);
        entries.push({
          cycleWeek: 1,
          weekday: weekday(day.day_of_week),
          slot: number,
          ...(start && { start }),
          ...(end && { end }),
          subjectExternalId: found.subject.uuid,
          subjectName: subjectNames.get(found.subject.uuid) ?? found.subject.uuid,
          ...(group && { groupLabel: group }),
          ...(room && { room }),
          ...teacherOf(rows, found.template.teacher?.id),
          templateRef: ref!,
        });
      }
    }
  }
  entries.sort((a, b) => a.weekday - b.weekday || a.slot - b.slot);
  return { ...(term && { termExternalId: term.externalId }), cycleWeeks: 1, entries };
}

/**
 * The 6.7a row of the student on a subject: the whole-class row, or the group row of their own templates. Fails closed:
 * rows of two teachers, or several rows with a partition type it does not know, give none.
 */
function rowOf(
  subjectId: string,
  rows: readonly StudentSubjectRow[],
  planning: ReadonlyMap<string, PlanningSubject>,
  mine: ReadonlySet<string>,
  refs: LessonRefs,
  check: DriftCheck,
): StudentSubjectRow | undefined {
  const candidates = rows.filter((r) => r.id === subjectId);
  for (const r of candidates) check.known(r.partition_type, PARTITION_TYPES, 'subjects[].partition_type');
  const one = (list: readonly StudentSubjectRow[]) =>
    new Set(list.map((r) => r.teacher_id ?? null)).size === 1 ? list[0] : undefined;
  const whole = candidates.filter((r) => r.partition_type === 'CLASS');
  if (whole.length > 0) return one(whole);
  if (candidates.length === 1 && candidates[0]!.partition_type !== 'GROUP') return candidates[0];
  const myTeachers = new Set(
    (planning.get(subjectId)?.templates ?? [])
      .filter((t) => mine.has(t.uuid))
      .map((t) => t.teacher?.id)
      .filter((id): id is string => !!id),
  );
  return one(
    candidates.filter(
      (r) =>
        r.partition_type === 'GROUP' &&
        !!r.teacher_id &&
        (myTeachers.has(r.teacher_id) || taughtBy(refs, subjectId, r.teacher_id)),
    ),
  );
}

/** Subjects with the student's teacher, group, level, short name and lessons per week */
export function enrichSubjects(
  subjects: readonly Subject[],
  rows: readonly StudentSubjectRow[],
  planning: readonly PlanningSubject[],
  mine: ReadonlySet<string>,
  refs: LessonRefs,
  check: DriftCheck,
): Subject[] {
  const plan = new Map(planning.map((p) => [p.uuid, p]));
  return subjects.map((s) => {
    const row = rowOf(s.externalId, rows, plan, mine, refs, check);
    const mineHere = (plan.get(s.externalId)?.templates ?? []).filter((t) => mine.has(t.uuid));
    // a template of another group never counts: one of the student's own, or none
    const template = mineHere.length === 1 ? mineHere[0] : undefined;
    const levelText = clean(row?.level_of_study) ?? clean(template?.level_of_study?.value);
    if (levelText) check.known(levelText, Object.keys(LEVELS), 'subjects[].level_of_study');
    const short = clean(plan.get(s.externalId)?.school_subject?.as_json?.short_name);
    return {
      ...s,
      ...(short && { shortName: short }),
      ...(row?.teacher_id && { teacherExternalId: row.teacher_id }),
      ...(row && clean(row.teacher) && { teacherName: clean(row.teacher)! }),
      ...(row?.partition_type === 'GROUP' && clean(row.group_name) && { groupLabel: clean(row.group_name)! }),
      ...(levelText && LEVELS[levelText] && { level: LEVELS[levelText] }),
      ...(levelText && { levelLabel: levelText }),
      ...(template?.study_hours && { lessonsPerWeek: template.study_hours }),
    };
  });
}

/** Rooms of the student's own slots, as counts for the probe: no room in the slot, a room the school list lacks */
export function roomFacts(
  timetable: ClassTimetable | undefined,
  mine: ReadonlySet<string>,
  premises: readonly Premise[],
) {
  const numbers = new Map(premises.map((p) => [p.uuid, clean(p.audience_number)]));
  const facts = { slots: 0, withoutRoom: 0, roomNotListed: 0, roomWithoutNumber: 0, premises: premises.length };
  for (const day of timetable?.days_of_week ?? []) {
    for (const ts of day.timetable_slots) {
      for (const slot of ts.slots) {
        if (!slot.lesson_template_id || !mine.has(slot.lesson_template_id)) continue;
        facts.slots++;
        if (!slot.room_id) facts.withoutRoom++;
        else if (!numbers.has(slot.room_id)) facts.roomNotListed++;
        else if (!numbers.get(slot.room_id)) facts.roomWithoutNumber++;
      }
    }
  }
  return facts;
}
