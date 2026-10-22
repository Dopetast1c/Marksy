import { describe, expect, it } from 'vitest';
import { defaultFamilyRules } from '../grading/family-rules';
import { by10, de16 } from '../grading/scales';
import type { Capabilities } from '../providers/manifest';
import { sampleManifest } from '../testing/samples';
import { lessonHint, stripAdvice, subjectHints, topHints } from './guidance';
import type { GuidanceLesson, GuidanceMark, SubjectGuidanceInput } from './guidance';

const caps = sampleManifest.capabilities;
const bare: Capabilities = { ...caps, lessonTypes: false, workTypes: false, comments: false, attendance: 'none' };
const today = '2026-10-14';
const m = (date: string, v: number, extra: Partial<GuidanceMark> = {}): GuidanceMark => ({
  date,
  subjectId: 'alg',
  values: [v],
  raw: String(v),
  ...extra,
});
const lesson = (id: string, date: string, extra: Partial<GuidanceLesson> = {}): GuidanceLesson => ({
  id,
  date,
  subjectId: 'alg',
  isTest: false,
  hasHomework: false,
  ...extra,
});
const input = (over: Partial<SubjectGuidanceInput>): SubjectGuidanceInput => ({
  scale: by10,
  rules: defaultFamilyRules(by10),
  caps,
  today,
  termMarks: [],
  lessons: [],
  absences: [],
  ...over,
});
const rules = (hints: { rule: string }[]) => hints.map((h) => h.rule);

describe('subject hints', () => {
  it('upcoming test from the tag flag, with the last topics as advice', () => {
    const hints = subjectHints(
      input({
        termMarks: [m('2026-10-01', 8)],
        lessons: [
          lesson('l1', '2026-10-12', { topic: 'Linear equations' }),
          lesson('l2', '2026-10-13', { topic: 'Systems' }),
          lesson('l3', '2026-10-16', { isTest: true }),
        ],
      }),
    );
    expect(hints[0]).toMatchObject({
      rule: 'upcomingTest',
      fact: { key: 'guidance.upcomingTest.fact', params: { date: '2026-10-16' } },
      advice: { params: { topics: ['Systems', 'Linear equations'] } },
      lessonId: 'l3',
    });
  });

  it('the lesson type alone never makes a test', () => {
    const hints = subjectHints(
      input({ termMarks: [m('2026-10-01', 8)], lessons: [lesson('l', '2026-10-16', { lessonType: 'test' })] }),
    );
    expect(rules(hints)).toEqual(['allGood']);
  });

  it('a low mark to fix, quoting the comment only with the capability', () => {
    const marks = [m('2026-10-05', 3, { comment: 'Tasks 2 and 3', workType: 'test' }), m('2026-10-06', 8)];
    expect(subjectHints(input({ termMarks: marks }))[0]).toMatchObject({
      rule: 'lowMark',
      severity: 'critical',
      fact: { params: { raw: '3', workType: 'test', date: '2026-10-05' } },
      advice: { key: 'guidance.lowMark.adviceComment', params: { comment: 'Tasks 2 and 3' } },
    });
    expect(subjectHints(input({ termMarks: marks, caps: bare }))[0]).toMatchObject({
      fact: { params: { workType: null } },
      advice: { key: 'guidance.lowMark.advice' },
    });
    // older than 14 days: not a hint any more
    expect(rules(subjectHints(input({ termMarks: [m('2026-09-29', 3), m('2026-10-06', 8)] })))).not.toContain(
      'lowMark',
    );
  });

  it('homework weak spot and tests going worse need work types', () => {
    const marks = [
      m('2026-10-01', 6, { workType: 'homework' }),
      m('2026-10-02', 6, { workType: 'homework' }),
      m('2026-10-03', 8, { workType: 'classwork' }),
      m('2026-10-04', 9, { workType: 'classwork' }),
      m('2026-10-05', 5, { workType: 'test' }),
      m('2026-10-06', 6, { workType: 'test' }),
    ];
    expect(rules(subjectHints(input({ termMarks: marks })))).toEqual(['homeworkWeak', 'testsWorse']);
    expect(rules(subjectHints(input({ termMarks: marks, caps: bare })))).toEqual(['allGood']);
  });

  it('downward streak: the last three below the term average', () => {
    const marks = [9, 9, 9, 7, 7, 7].map((v, i) => m(`2026-10-0${i + 1}`, v));
    expect(subjectHints(input({ termMarks: marks }))[0]).toMatchObject({
      rule: 'downwardStreak',
      fact: { params: { marks: ['7', '7', '7'], termAverage: 8 } },
    });
  });

  it('the streak is direction-aware on de-1-6', () => {
    const marks = [1, 1, 1, 3, 3, 3].map((v, i) => m(`2026-10-0${i + 1}`, v));
    const hints = subjectHints(input({ scale: de16, rules: defaultFamilyRules(de16), termMarks: marks }));
    expect(rules(hints)).toContain('downwardStreak');
  });

  it('absence needs attendance', () => {
    const absences = [{ date: '2026-10-12', subjectId: 'alg', topic: 'Graphs' }];
    expect(rules(subjectHints(input({ absences })))).toEqual(['absence']);
    expect(rules(subjectHints(input({ absences, caps: bare })))).toEqual(['allGood']);
  });

  it('most severe first, at most five; advice can be stripped', () => {
    const hints = subjectHints(
      input({
        termMarks: [m('2026-10-12', 3)],
        absences: [{ date: '2026-10-12', subjectId: 'alg' }],
        lessons: [lesson('t', '2026-10-15', { isTest: true })],
      }),
    );
    expect(hints.map((h) => h.severity)).toEqual(['critical', 'low', 'ok']);
    expect(stripAdvice(hints).every((h) => h.advice === undefined && h.fact.key)).toBe(true);
  });
});

describe('lesson hints', () => {
  const r = defaultFamilyRules(by10);
  const base = { scale: by10, rules: r, caps };
  const marks = [
    m('2026-10-05', 6, { workType: 'homework' }),
    m('2026-10-06', 5, { comment: 'Redo', workType: 'homework' }),
  ];

  it('first match wins, in the order of design 6.2', () => {
    expect(lessonHint({ ...base, lesson: lesson('a', today, { isTest: true }), termMarks: marks })?.rule).toBe(
      'lessonTest',
    );
    expect(lessonHint({ ...base, lesson: lesson('a', today, { lessonType: 'lab' }), termMarks: marks })?.rule).toBe(
      'lessonPractical',
    );
    expect(lessonHint({ ...base, lesson: lesson('a', today, { hasHomework: true }), termMarks: marks })?.rule).toBe(
      'lessonRisk',
    );
    const lowWithComment = [m('2026-10-06', 4, { comment: 'Redo' })];
    expect(lessonHint({ ...base, lesson: lesson('a', today), termMarks: lowWithComment })?.rule).toBe('lessonLastLow');
  });

  it('homework average below the good band', () => {
    const good = [m('2026-10-01', 9), m('2026-10-02', 9), m('2026-10-03', 6, { workType: 'homework' })];
    expect(lessonHint({ ...base, lesson: lesson('a', today, { hasHomework: true }), termMarks: good })?.rule).toBe(
      'lessonHomeworkWeak',
    );
  });

  it('no marks, no hint; the day card keeps the top three', () => {
    expect(lessonHint({ ...base, lesson: lesson('a', today, { isTest: true }), termMarks: [] })).toBeNull();
    const h = lessonHint({ ...base, lesson: lesson('a', today, { isTest: true }), termMarks: marks });
    expect(topHints([null, h, h, h, h])).toHaveLength(3);
  });
});
