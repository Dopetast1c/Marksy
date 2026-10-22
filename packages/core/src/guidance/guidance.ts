import type { FamilyRules } from '../grading/family-rules';
import { isLowMark } from '../grading/family-rules';
import { average, compare, isWorseThan, scaleUnit } from '../grading/scale';
import type { GradingScale } from '../grading/types';
import type { ISODate, LessonType, WorkType } from '../model/schemas';
import type { Capabilities } from '../providers/manifest';
import { addDays } from '../marks/dates';
import type { MarkFact } from '../marks/stats';

// Guidance rules (docs/design.md 6.2) as pure functions over data already stored; nothing is fetched for them.
// A hint is a fact plus optional advice, both as i18n keys with parameters: with settings.guidance off the advice is
// stripped and facts never depend on it. Numbers in params are raw scale values; the UI formats them with the scale.

export type Severity = 'critical' | 'low' | 'ok' | 'good';
export const SEVERITY_ORDER: readonly Severity[] = ['critical', 'low', 'ok', 'good'];

export type HintParams = Record<string, string | number | readonly string[] | null>;
export interface HintText {
  key: string;
  params: HintParams;
}

export interface Hint {
  rule: string;
  severity: Severity;
  fact: HintText;
  advice?: HintText;
  /** What the hint is about, for the tap target */
  lessonId?: string;
  date?: ISODate;
}

export interface GuidanceMark extends MarkFact {
  raw: string;
  workType?: WorkType;
  comment?: string;
}

export interface GuidanceLesson {
  id: string;
  date: ISODate;
  subjectId: string;
  /** Does the lesson carry the family's test tag («Контрольная»)? Decided by the server from tags, never here. */
  isTest: boolean;
  lessonType?: LessonType;
  hasHomework: boolean;
  topic?: string;
}

export interface GuidanceAbsence {
  date: ISODate;
  subjectId: string;
  topic?: string;
}

/** Work types that count as tests for "tests go worse" (canonical form of design 6.2's test filter). */
export const TEST_WORK_TYPES: ReadonlySet<WorkType> = new Set(['test', 'quiz', 'dictation', 'essay']);

type Requirement = keyof Pick<Capabilities, 'lessons' | 'lessonTypes' | 'workTypes' | 'comments' | 'attendance'>;

function has(caps: Capabilities, req: Requirement): boolean {
  const v = caps[req];
  return v !== false && v !== 'none';
}

const bySeverity = (a: Hint, b: Hint) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);

/** Remove the advice, keep the facts: what settings.guidance = off means. */
export function stripAdvice(hints: readonly Hint[]): Hint[] {
  return hints.map(({ advice: _advice, ...rest }) => rest);
}

export interface SubjectGuidanceInput {
  scale: GradingScale;
  rules: FamilyRules;
  caps: Capabilities;
  today: ISODate;
  /** Marks of this subject in the current term, any order */
  termMarks: readonly GuidanceMark[];
  /** Lessons of this subject, past and ahead */
  lessons: readonly GuidanceLesson[];
  /** Absences in this subject (attendance records, never marks) */
  absences: readonly GuidanceAbsence[];
}

interface SubjectRule {
  id: string;
  requires: Requirement[];
  run(input: SubjectGuidanceInput, ctx: { newestFirst: GuidanceMark[]; termAverage: number | null }): Hint | null;
}

function workAverage(scale: GradingScale, marks: readonly GuidanceMark[], pred: (m: GuidanceMark) => boolean) {
  const picked = marks.filter((m) => m.values.length && pred(m));
  return { average: average(scale, picked), n: picked.reduce((s, m) => s + m.values.length, 0) };
}

const SUBJECT_RULES: SubjectRule[] = [
  {
    id: 'upcomingTest',
    requires: ['lessons'],
    run({ caps, lessons, today }) {
      const soon = lessons
        .filter((l) => l.date > today && l.date <= addDays(today, 7))
        .filter((l) => l.isTest || (has(caps, 'lessonTypes') && l.lessonType === 'lab'))
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      if (!soon) return null;
      const topics = [
        ...new Set(
          lessons
            .filter((l) => l.date <= today && l.topic)
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 2)
            .map((l) => l.topic!),
        ),
      ];
      return {
        rule: 'upcomingTest',
        severity: 'low',
        fact: {
          key: soon.isTest ? 'guidance.upcomingTest.fact' : 'guidance.upcomingLab.fact',
          params: { date: soon.date },
        },
        ...(topics.length && { advice: { key: 'guidance.upcomingTest.advice', params: { topics } } }),
        lessonId: soon.id,
        date: soon.date,
      };
    },
  },
  {
    id: 'lowMark',
    requires: [],
    run({ scale, rules, caps, today }, { newestFirst }) {
      const low = newestFirst.find(
        (m) => m.date > addDays(today, -14) && m.values.some((v) => isLowMark(scale, v, rules)),
      );
      if (!low) return null;
      const comment = has(caps, 'comments') && low.comment ? low.comment : null;
      const advice: HintText = comment
        ? { key: 'guidance.lowMark.adviceComment', params: { comment } }
        : { key: 'guidance.lowMark.advice', params: { raw: low.raw } };
      return {
        rule: 'lowMark',
        severity: 'critical',
        fact: {
          key: 'guidance.lowMark.fact',
          params: { raw: low.raw, workType: has(caps, 'workTypes') ? (low.workType ?? null) : null, date: low.date },
        },
        advice,
        date: low.date,
      };
    },
  },
  {
    id: 'homeworkWeak',
    requires: ['workTypes'],
    run({ scale, termMarks }) {
      const hw = workAverage(scale, termMarks, (m) => m.workType === 'homework');
      const rest = workAverage(scale, termMarks, (m) => m.workType !== 'homework' && !TEST_WORK_TYPES.has(m.workType!));
      if (hw.n < 2 || rest.n < 2 || hw.average == null || rest.average == null) return null;
      if ((rest.average - hw.average) * (scale.higherIsBetter ? 1 : -1) < scaleUnit(scale) - 1e-9) return null;
      return {
        rule: 'homeworkWeak',
        severity: 'low',
        fact: {
          key: 'guidance.homeworkWeak.fact',
          params: { homeworkAverage: hw.average, classAverage: rest.average },
        },
        advice: { key: 'guidance.homeworkWeak.advice', params: {} },
      };
    },
  },
  {
    id: 'testsWorse',
    requires: ['workTypes'],
    run({ scale, termMarks }) {
      const tests = workAverage(scale, termMarks, (m) => m.workType !== undefined && TEST_WORK_TYPES.has(m.workType));
      const rest = workAverage(scale, termMarks, (m) => m.workType === undefined || !TEST_WORK_TYPES.has(m.workType));
      if (tests.n < 2 || rest.n < 2 || tests.average == null || rest.average == null) return null;
      if ((rest.average - tests.average) * (scale.higherIsBetter ? 1 : -1) < scaleUnit(scale) - 1e-9) return null;
      return {
        rule: 'testsWorse',
        severity: 'low',
        fact: { key: 'guidance.testsWorse.fact', params: { testsAverage: tests.average, restAverage: rest.average } },
        advice: { key: 'guidance.testsWorse.advice', params: {} },
      };
    },
  },
  {
    id: 'downwardStreak',
    requires: [],
    run({ scale }, { newestFirst, termAverage }) {
      const last3 = newestFirst.filter((m) => m.values.length).slice(0, 3);
      if (last3.length < 3 || termAverage == null) return null;
      if (!last3.every((m) => m.values.every((v) => isWorseThan(scale, v, termAverage)))) return null;
      return {
        rule: 'downwardStreak',
        severity: 'low',
        fact: {
          key: 'guidance.downwardStreak.fact',
          params: { marks: last3.map((m) => m.raw).reverse(), termAverage },
        },
        advice: { key: 'guidance.downwardStreak.advice', params: {} },
      };
    },
  },
  {
    id: 'absence',
    requires: ['attendance'],
    run({ absences, today }) {
      const a = [...absences]
        .filter((x) => x.date > addDays(today, -14) && x.date <= today)
        .sort((x, y) => y.date.localeCompare(x.date))[0];
      if (!a) return null;
      return {
        rule: 'absence',
        severity: 'ok',
        fact: { key: 'guidance.absence.fact', params: { date: a.date } },
        advice: { key: 'guidance.absence.advice', params: { topic: a.topic ?? null } },
        date: a.date,
      };
    },
  },
];

/** "Обратить внимание" on the subject screen: at most five hints, most severe first; "all is even" when none apply. */
export function subjectHints(input: SubjectGuidanceInput, limit = 5): Hint[] {
  const newestFirst = [...input.termMarks].sort((a, b) => b.date.localeCompare(a.date));
  const termAverage = average(input.scale, input.termMarks);
  const out = SUBJECT_RULES.filter((r) => r.requires.every((req) => has(input.caps, req)))
    .map((r) => r.run(input, { newestFirst, termAverage }))
    .filter((h): h is Hint => h !== null);
  if (!out.length) {
    out.push({
      rule: 'allGood',
      severity: 'good',
      fact: { key: 'guidance.allGood.fact', params: { termAverage } },
      advice: { key: 'guidance.allGood.advice', params: {} },
    });
  }
  return out.sort(bySeverity).slice(0, limit);
}

export interface LessonHintInput {
  scale: GradingScale;
  rules: FamilyRules;
  caps: Capabilities;
  lesson: GuidanceLesson;
  /** Marks of the lesson's subject in the current term */
  termMarks: readonly GuidanceMark[];
}

/** The schedule hint of one lesson today or later: at most one, first match wins (design 6.2). */
export function lessonHint({ scale, rules, caps, lesson, termMarks }: LessonHintInput): Hint | null {
  const numeric = termMarks.filter((m) => m.values.length);
  if (!numeric.length) return null;
  const termAverage = average(scale, numeric);
  const last = [...numeric].sort((a, b) => b.date.localeCompare(a.date))[0]!;
  const base = { lessonId: lesson.id, date: lesson.date };

  if (lesson.isTest) {
    return {
      ...base,
      rule: 'lessonTest',
      severity: 'low',
      fact: { key: 'guidance.lessonTest.fact', params: { termAverage, lastMark: last.raw } },
      advice: { key: 'guidance.lessonTest.advice', params: {} },
    };
  }
  if (has(caps, 'lessonTypes') && (lesson.lessonType === 'lab' || lesson.lessonType === 'practical')) {
    return {
      ...base,
      rule: 'lessonPractical',
      severity: 'ok',
      fact: { key: 'guidance.lessonPractical.fact', params: { lessonType: lesson.lessonType } },
      advice: { key: 'guidance.lessonPractical.advice', params: {} },
    };
  }
  if (has(caps, 'comments') && last.comment && last.values.some((v) => isLowMark(scale, v, rules))) {
    return {
      ...base,
      rule: 'lessonLastLow',
      severity: 'low',
      fact: { key: 'guidance.lessonLastLow.fact', params: { raw: last.raw, comment: last.comment } },
    };
  }
  // "risk zone": the term average has not reached the good band
  const goodEdge = scale.bands.good && (scale.higherIsBetter ? scale.bands.good.from : scale.bands.good.to);
  if (lesson.hasHomework && termAverage != null && goodEdge != null && compare(scale, termAverage, goodEdge) < 0) {
    return {
      ...base,
      rule: 'lessonRisk',
      severity: 'low',
      fact: { key: 'guidance.lessonRisk.fact', params: { termAverage } },
      advice: { key: 'guidance.lessonRisk.advice', params: {} },
    };
  }
  if (lesson.hasHomework && has(caps, 'workTypes') && goodEdge != null) {
    const hw = average(
      scale,
      numeric.filter((m) => m.workType === 'homework'),
    );
    if (hw != null && compare(scale, hw, goodEdge) < 0) {
      return {
        ...base,
        rule: 'lessonHomeworkWeak',
        severity: 'ok',
        fact: { key: 'guidance.lessonHomeworkWeak.fact', params: { homeworkAverage: hw } },
        advice: { key: 'guidance.lessonHomeworkWeak.advice', params: {} },
      };
    }
  }
  return null;
}

/** The timetable day card "Обратить внимание": the top hints of the day's lessons by severity. */
export function topHints(hints: readonly (Hint | null)[], limit = 3): Hint[] {
  return hints
    .filter((h): h is Hint => h !== null)
    .sort(bySeverity)
    .slice(0, limit);
}
