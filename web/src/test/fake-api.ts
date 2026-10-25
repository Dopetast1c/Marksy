import { getScale } from '@marksy/core';
import { vi } from 'vitest';

// A fake of the Marksy API for screen tests: a session flag and fictional data (D16: the demo family's names). Every
// request the app makes goes through it; an unknown route is a test failure, not a silent 404.

export interface FakeState {
  signedIn: boolean;
  calls: string[];
  /** every request with its query string */
  urls: string[];
  /** request bodies by route, last one wins */
  bodies: Record<string, unknown>;
  /** the connected diary refuses the login */
  diaryRefuses?: boolean;
  /** a diary without work and lesson types (the usual real case, api-spec 7.3): every type is null */
  noTypes?: boolean;
  /** Оценки answers in two pages */
  feedPages?: boolean;
  /** the signed-in person's interface language */
  locale?: string;
  /** the subject screen's answer, when a test needs another one */
  subject?: unknown;
  /** the lesson menu's actions answer 409 with this code (lesson_passed, diary_has_lesson) */
  lessonRefuses?: string;
  /** /api/sync/status and /api/sync/runs, when a test needs them */
  syncStatus?: unknown;
  syncRuns?: unknown;
  /** the person's own «Подсказки» switch */
  guidance?: boolean;
  /** Оформление: what PATCH /api/me/settings and the wallpaper routes have made of it */
  appearance?: Record<string, unknown>;
  /** who is signed in: the admin by default; a student sees only their own card */
  role?: 'admin' | 'parent' | 'student';
  /** fields laid over every child's /overview answer */
  overview?: Record<string, unknown>;
  /** the school's today for Расписание's days (a weekend, to see where День opens) */
  scheduleToday?: string;
}

const CARDS = [
  {
    id: 'kid-milena',
    name: 'Милена',
    classLabel: '7 «Г»',
    grade: 7,
    schoolLabel: null,
    showSchool: false,
    hasMarks: true,
    newCount: 8,
    week: { current: 'marks', previous: 'marks', average: 7.4, prevAverage: 8.2, delta: -0.8, trend: 'down' },
    absencesWeek: 3,
    nextDay: null,
    now: { state: 'lesson', slot: 3, subjectName: 'Алгебра', until: '10:40' },
    nearestTag: null,
  },
  {
    id: 'kid-mark',
    name: 'Марк',
    classLabel: '1 «Д»',
    grade: 1,
    schoolLabel: null,
    showSchool: false,
    hasMarks: false,
    newCount: 0,
    week: null,
    absencesWeek: null,
    nextDay: { date: '2026-10-26', lessons: 3, homework: 2 },
    now: null,
    nearestTag: null,
  },
];

const PROVIDERS = [
  {
    id: 'demo-full',
    name: 'Школьный портал (демо)',
    country: null,
    status: 'beta',
    roles: ['parent'],
    auth: {
      kind: 'password',
      fields: [
        { key: 'login', label: { ru: 'Логин' }, type: 'text' },
        { key: 'password', label: { ru: 'Пароль' }, type: 'password' },
      ],
    },
  },
];

const scale = getScale('by-10');

export const KIDS = [
  {
    id: 'kid-milena',
    name: 'Милена',
    classLabel: '7 «Г»',
    grade: 7,
    schoolLabel: null,
    timezone: 'Europe/Minsk',
    providerId: 'demo-full',
    capabilities: {
      lessons: true,
      futureTimetable: true,
      bellSchedule: true,
      attendance: 'derived',
      terms: 'quarter',
      finalMarks: true,
      behaviour: 'separate',
    },
    gradingScale: scale,
    avatar: null,
  },
  {
    id: 'kid-mark',
    name: 'Марк',
    classLabel: '1 «Д»',
    grade: 1,
    schoolLabel: null,
    timezone: 'Europe/Minsk',
    providerId: 'demo-full',
    capabilities: {},
    gradingScale: null,
    avatar: null,
  },
];

const week = (offset: number, from: string, to: string, end = to) => ({
  kind: 'week',
  offset,
  from,
  to,
  end,
  termLabel: null,
  termKind: null,
  termIndex: null,
  count: 12 - offset * 3,
});

const chip = (id: string, raw: string, band: string | null) => ({
  id,
  values: band ? [Number(raw)] : [],
  raw,
  kind: 'SINGLE',
  band,
});
const Q1 = { id: 'q1', kind: 'quarter', index: 1, label: '1', from: '2026-09-01', to: '2026-10-31' };
const lesson = (id: string, slot: number, start: string, end: string, subjectName: string, extra: object = {}) => ({
  id,
  date: '2026-10-22',
  slot,
  start,
  end,
  subjectId: `sub-${id}`,
  subjectName,
  teacherName: null,
  room: '206',
  groupLabel: null,
  lessonType: null,
  topic: null,
  homework: null,
  homeworkDueDate: null,
  hasAttachments: false,
  cancelled: false,
  ready: null,
  ownHomework: [],
  marks: [],
  absent: false,
  teacherComment: null,
  tags: [],
  setHere: [],
  isTest: false,
  ...extra,
});
const bands = (counts: [number, number, number, number], prev: [number, number, number, number] | null) =>
  (['critical', 'low', 'good', 'top'] as const).map((band, i) => ({
    band,
    labelKey: `band.${band}`,
    from: [1, 5, 7, 9][i],
    to: [4, 6, 8, 10][i],
    count: counts[i],
    prevCount: prev ? prev[i] : null,
  }));
const PERIOD = {
  kind: 'week',
  offset: 0,
  from: '2026-10-19',
  to: '2026-10-21',
  end: '2026-10-25',
  termLabel: null,
  termKind: null,
  termIndex: null,
};
const EVENTS = [
  {
    kind: 'low_mark',
    severity: 'critical',
    date: '2026-10-20',
    subject: { id: 'sub-ph', name: 'Физика' },
    facts: { mark: chip('m9', '3', 'critical'), workType: 'quiz', topic: null, comment: 'Не решены задачи 2 и 3' },
    link: { screen: 'subject', subjectId: 'sub-ph' },
  },
  {
    kind: 'average_down',
    severity: 'low',
    date: '2026-10-21',
    subject: { id: 'sub-ph', name: 'Физика' },
    facts: { average: 4, prevAverage: 6, delta: -2, count: 2 },
    link: { screen: 'subject', subjectId: 'sub-ph' },
  },
  {
    kind: 'teacher_comment',
    severity: 'neutral',
    date: '2026-10-21',
    subject: { id: 'sub-en', name: 'Английский язык' },
    facts: { text: 'Нет домашнего задания', slot: 3 },
    link: { screen: 'schedule', lessonId: 'l3', date: '2026-10-21' },
  },
  ...['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-21'].map((date, i) => ({
    kind: 'absence',
    severity: 'low',
    date,
    subject: { id: `sub-a${i}`, name: 'Беларуская мова' },
    facts: { status: 'absent', excused: null, code: null },
    link: { screen: 'schedule', lessonId: null, date },
  })),
];
export const OVERVIEW: Record<string, unknown> = {
  'kid-milena': {
    period: PERIOD,
    hasMarks: true,
    comparison: { current: 'marks', previous: 'marks', average: 7.4, prevAverage: 8.2, delta: -0.8, trend: 'down' },
    marksCount: 12,
    prevMarksCount: 15,
    bands: bands([1, 2, 6, 3], [0, 2, 8, 5]),
    distribution: Array.from({ length: 10 }, (_, i) => ({
      from: i + 1,
      to: i + 1,
      count: [0, 0, 1, 0, 1, 1, 3, 3, 2, 1][i],
    })),
    absences: 4,
    prevAbsences: 1,
    newCount: 3,
    lessonTiles: null,
    lastDay: {
      date: '2026-10-21',
      marks: [
        { subject: { id: 'sub-al', name: 'Алгебра' }, mark: chip('m1', '9', 'top'), workType: null, comment: null },
        {
          subject: { id: 'sub-ph', name: 'Физика' },
          mark: chip('m2', '3', 'critical'),
          workType: 'quiz',
          comment: 'Пересдача во вторник',
        },
      ],
    },
    movers: [],
    attention: EVENTS.slice(0, 5),
    attentionTotal: EVENTS.length,
    nextDay: {
      date: '2026-10-22',
      lessons: [
        lesson('l2', 2, '09:25', '10:10', 'Алгебра', { homework: '№ 214, 215' }),
        lesson('l4', 4, '11:25', '12:10', 'Физика', { lessonType: 'lab' }),
      ],
    },
    now: { state: 'lesson', slot: 3, subjectName: 'Беларуская мова', room: '206', until: '10:40' },
  },
  'kid-mark': {
    period: PERIOD,
    hasMarks: false,
    comparison: null,
    marksCount: 0,
    prevMarksCount: null,
    bands: [],
    distribution: [],
    absences: null,
    prevAbsences: null,
    newCount: 0,
    lessonTiles: { lessons: 15, homework: 9, prevLessons: 16, prevHomework: 7 },
    lastDay: null,
    movers: [],
    attention: [],
    attentionTotal: 0,
    nextDay: null,
    now: { state: 'done', at: '11:45', next: { date: '2026-10-26', at: '08:30' } },
  },
};
const TREND = {
  period: PERIOD,
  buckets: [
    {
      from: '2026-10-05',
      to: '2026-10-11',
      future: false,
      selected: false,
      average: 8.1,
      count: 9,
      bands: { critical: 0, low: 1, good: 5, top: 3 },
    },
    {
      from: '2026-10-12',
      to: '2026-10-18',
      future: false,
      selected: false,
      average: 8.2,
      count: 15,
      bands: { critical: 0, low: 2, good: 8, top: 5 },
    },
    {
      from: '2026-10-19',
      to: '2026-10-21',
      future: false,
      selected: true,
      average: 7.4,
      count: 12,
      bands: { critical: 1, low: 2, good: 6, top: 3 },
    },
  ],
};
const SCHOOL = {
  timezone: 'Europe/Minsk',
  year: { label: '2026/27', from: '2026-09-01', to: '2027-05-31' },
  terms: [
    { id: 'q1', kind: 'quarter', index: 1, label: '1', from: '2026-09-01', to: '2026-10-31', note: null },
    { id: 'q2', kind: 'quarter', index: 2, label: '2', from: '2026-11-09', to: '2026-12-24', note: null },
  ],
  holidays: [{ from: '2026-11-01', to: '2026-11-08', note: null, kind: 'autumn' }],
  bells: [
    {
      label: null,
      days: [1, 2, 3, 4, 5],
      periods: [
        { slot: 1, start: '08:30', end: '09:15' },
        { slot: 2, start: '09:25', end: '10:10' },
        { slot: 3, start: '10:30', end: '11:15' },
        { slot: 4, start: '11:25', end: '12:10' },
      ],
    },
  ],
};

const periods = {
  today: '2026-10-21',
  counts: 'marks',
  kinds: ['week', 'month', 'term', 'year'],
  instances: {
    week: [
      week(0, '2026-10-19', '2026-10-21', '2026-10-25'),
      week(1, '2026-10-12', '2026-10-18'),
      week(2, '2026-10-05', '2026-10-11'),
    ],
    month: [{ ...week(0, '2026-10-01', '2026-10-21', '2026-10-31'), kind: 'month' }],
    term: [
      {
        ...week(0, '2026-09-01', '2026-10-21', '2026-10-31'),
        kind: 'term',
        termLabel: null,
        termKind: 'quarter',
        termIndex: 1,
      },
    ],
    year: [{ ...week(0, '2026-09-01', '2026-10-21', '2027-05-31'), kind: 'year' }],
  },
  finals: { state: 'running', term: Q1 },
};

// Оценки: two days; marks with and without a work type and a topic, an absence, a teacher's comment, a corrected mark,
// the first term's finals card
const subj = (id: string, name: string) => ({ id, name, color: null });
export const FEED = [
  {
    type: 'mark',
    id: 'f1',
    date: '2026-10-14',
    subject: { ...subj('sub-al', 'Алгебра'), color: 'violet' },
    mark: chip('fm1', '9', 'top'),
    workType: null,
    workTypeRaw: null,
    topic: 'Квадратные уравнения',
    comment: null,
    lessonId: null,
    tagIds: [],
    isNew: false,
  },
  {
    type: 'mark',
    id: 'f2',
    date: '2026-10-14',
    subject: subj('sub-ph', 'Физика'),
    mark: chip('fm2', '4', 'critical'),
    workType: 'test',
    workTypeRaw: 'КР',
    topic: null,
    comment: 'Не решены задачи 2 и 3',
    lessonId: null,
    tagIds: [],
    isNew: false,
  },
  {
    type: 'absence',
    id: 'f3',
    date: '2026-10-14',
    subject: subj('sub-by', 'Беларуская мова'),
    code: 'н',
    excused: null,
    lessonId: null,
  },
  {
    type: 'comment',
    id: 'f4',
    date: '2026-10-14',
    subject: subj('sub-en', 'Английский язык'),
    text: 'Нет домашнего задания',
    lessonId: null,
    slot: 3,
  },
  {
    type: 'markChanged',
    id: 'f5',
    date: '2026-10-14',
    subject: subj('sub-hi', 'История'),
    mark: chip('fm5', '7', 'good'),
    before: '6',
    seenAt: '2026-10-15T09:00:00Z',
  },
  {
    type: 'finals',
    id: 'finals-q1',
    date: '2026-10-13',
    term: Q1,
    marks: [{ subject: subj('sub-al', 'Алгебра'), mark: chip('fq1', '8', 'good') }],
    differ: 1,
  },
  {
    type: 'mark',
    id: 'f6',
    date: '2026-10-13',
    subject: subj('sub-ge', 'Геометрия'),
    mark: chip('fm6', '6', 'low'),
    workType: null,
    workTypeRaw: null,
    topic: null,
    comment: null,
    lessonId: null,
    tagIds: [],
    isNew: false,
  },
];

const cell = (kind: 'final' | 'running' | 'none', value: number | null) => ({
  kind,
  raw: kind === 'final' ? String(value) : null,
  value,
  postedOn: kind === 'final' ? '2026-10-31' : null,
  source: kind === 'final' ? 'api' : null,
});
export const TERM_FINALS = {
  state: { state: 'running', term: Q1 },
  year: { id: 'y1', label: '2026-2027' },
  terms: [Q1, { ...Q1, id: 'q2', index: 2, from: '2026-11-09', to: '2026-12-24' }],
  lastYear: { id: 'y0', label: '2025-2026' },
  rows: [
    {
      subject: subj('sub-al', 'Алгебра'),
      lastYear: { raw: '7', value: 7 },
      terms: [
        { termId: 'q1', ...cell('final', 8) },
        { termId: 'q2', ...cell('none', null) },
      ],
      year: cell('running', 8),
    },
    {
      subject: subj('sub-ge', 'Геометрия'),
      lastYear: null,
      terms: [
        { termId: 'q1', ...cell('running', 6.4) },
        { termId: 'q2', ...cell('none', null) },
      ],
      year: cell('none', null),
    },
  ],
};
export const YEAR_FINALS = {
  years: [
    { id: 'y0', label: '2025-2026', current: false },
    { id: 'y1', label: '2026-2027', current: true },
  ],
  rows: [
    {
      subjectName: 'Алгебра',
      subjectId: 'sub-al',
      isNew: false,
      cells: [
        { yearId: 'y0', ...cell('final', 7), source: 'manual' },
        { yearId: 'y1', ...cell('running', 8) },
      ],
      trend: 'up',
    },
    {
      subjectName: 'Природоведение',
      subjectId: null,
      isNew: false,
      cells: [
        { yearId: 'y0', ...cell('final', 9) },
        { yearId: 'y1', ...cell('none', null) },
      ],
      trend: null,
    },
    {
      subjectName: 'Геометрия',
      subjectId: 'sub-ge',
      isNew: true,
      cells: [
        { yearId: 'y0', ...cell('none', null) },
        { yearId: 'y1', ...cell('none', null) },
      ],
      trend: null,
    },
  ],
};

// Предметы and Предмет
const info = (id: string, name: string, extra: object = {}) => ({
  id,
  name,
  shortName: null,
  teacherName: null,
  groupLabel: null,
  level: null,
  levelLabel: null,
  lessonsPerWeek: null,
  color: null,
  ...extra,
});
const cmp = (average: number | null, prevAverage: number | null, trend: string | null, delta: number | null) => ({
  current: average == null ? 'empty' : 'marks',
  previous: prevAverage == null ? 'empty' : 'marks',
  average,
  prevAverage,
  delta,
  trend,
});
export const SUBJECTS = {
  'kid-milena': [
    {
      subject: info('sub-al', 'Алгебра', { color: 'blue' }),
      comparison: cmp(7.5, 8.5, 'down', -1),
      count: 2,
      last: [chip('s1', '7', 'good'), chip('s2', '8', 'good')],
      absences: 0,
      comments: 2,
      final: null,
      lessons: null,
    },
    {
      subject: info('sub-en', 'Английский язык', { level: 'advanced' }),
      comparison: cmp(null, 9, null, null),
      count: 0,
      last: [],
      absences: 0,
      final: null,
      lessons: null,
    },
  ],
  'kid-mark': [
    {
      subject: info('sub-ma', 'Математика'),
      comparison: null,
      count: 0,
      last: [],
      absences: null,
      final: null,
      lessons: { count: 5, homework: 3, next: { date: '2026-10-28', slot: 2, homework: 'с. 14, № 3', lessonId: 'l9' } },
    },
  ],
};
export const SUBJECT = {
  subject: info('sub-al', 'Алгебра', { color: 'blue', teacherName: 'Учитель Алгебры', lessonsPerWeek: 3 }),
  period: PERIOD,
  settings: { goal: 8, goalAvailable: true },
  attention: {
    goal: {
      target: 8,
      state: 'short',
      term: Q1,
      average: 7.1,
      projected: 7,
      need: 7.5,
      plan: [
        { value: 10, count: 1 },
        { value: 9, count: 2 },
      ],
      keep: null,
      final: null,
    },
    hints: [
      {
        rule: 'lowMark',
        severity: 'critical',
        fact: { key: 'guidance.lowMark.fact', params: { raw: '3', workType: null, date: '2026-10-13' } },
        advice: { key: 'guidance.lowMark.advice', params: { raw: '3' } },
        date: '2026-10-13',
      },
    ],
  },
  comparison: cmp(7.5, 8.5, 'down', -1),
  count: 2,
  prevCount: 3,
  bands: bands([0, 0, 2, 0], [0, 0, 2, 1]),
  distribution: [],
  timeline: [FEED[0]],
  upcoming: [{ ...lesson('u1', 2, '08:55', '09:40', 'Алгебра'), subjectId: 'sub-al', date: '2026-10-26' }],
  lessonTiles: null,
  terms: [{ ...Q1, cell: cell('running', 7.1), average: 7.1 }],
  year: cell('none', null),
  lastYear: { label: '2025-2026', raw: null, value: null },
  week: [{ weekday: 1, slot: 2, start: '08:55', end: '09:40', room: '305', groupLabel: null }],
};

/** Расписание: today (Wed 21 Oct) is over at 19:12; tomorrow starts with the second lesson and has a window */
const facts = (since: number) => ({
  average: 7.6,
  last: [chip('h1', '8', 'good'), chip('h2', '6', 'low'), chip('h3', '9', 'top')],
  lastDate: '2026-10-14',
  since,
});
const TEST_TAG = { id: 'tag-test', name: 'Контрольная', icon: 'test', tone: 'important', presetKey: 'test' };
export const SCHEDULE_DAYS: Record<string, ReturnType<typeof lesson>[]> = {
  '2026-10-21': [
    lesson('t1', 1, '08:30', '09:15', 'Математика', {
      date: '2026-10-21',
      marks: [{ ...chip('tm1', '9', 'top'), workType: null, comment: 'Аккуратная работа' }],
    }),
    lesson('t2', 2, '09:25', '10:10', 'Английский язык', {
      date: '2026-10-21',
      absent: true,
      teacherComment: 'Нет домашнего задания',
      notes: null,
    }),
  ],
  '2026-10-22': [
    lesson('l2', 2, '09:25', '10:10', 'Алгебра', {
      homework: '№ 214, 215',
      groupLabel: '2-я подгруппа',
      notes: {
        facts: facts(5),
        signal: { kind: 'call', lessons: 5, average: 7.6 },
        hint: null,
      },
    }),
    lesson('l4', 4, '11:25', '12:10', 'Физика', {
      lessonType: 'lab',
      isTest: true,
      tags: [{ tag: TEST_TAG, field: 'topic', snippet: 'К/р №2 по теме «Сила тока»', setOn: null }],
      notes: {
        facts: null,
        signal: null,
        hint: {
          rule: 'lessonTest',
          severity: 'low',
          fact: { key: 'guidance.lessonTest.fact', params: { termAverage: 5.5, lastMark: '3' } },
          advice: { key: 'guidance.lessonTest.advice', params: {} },
        },
      },
    }),
  ],
  '2026-10-23': [
    lesson('f1', 1, '08:30', '09:15', 'Химия', {
      date: '2026-10-23',
      notes: { facts: null, signal: null, hint: null },
    }),
  ],
};
const SCHEDULE_ATTENTION = [
  {
    tag: TEST_TAG,
    field: 'topic',
    snippet: 'К/р №2 по теме «Сила тока»',
    setOn: null,
    lessonId: 'l4',
    date: '2026-10-22',
    slot: 4,
    subject: { id: 'sub-l4', name: 'Физика', color: null },
  },
];

/** Семья of the demo: a request to join, two members, two children, one diary */
const FAMILY = {
  family: { id: 'f1', name: 'Семья', parentsCanInvite: true, guidance: true },
  role: 'admin',
  members: [
    { userId: 'u1', displayName: 'Родитель', role: 'admin', studentIds: [] },
    { userId: 'u2', displayName: 'Бабушка', role: 'parent', studentIds: ['kid-mark'] },
  ],
  accounts: [
    {
      id: 'acc-1',
      providerId: 'demo-full',
      providerName: 'Школьный портал (демо)',
      label: 'demo-login',
      status: 'ok',
      requiresAction: null,
      studentIds: ['kid-milena', 'kid-mark'],
    },
  ],
  children: [
    {
      studentId: 'kid-milena',
      name: 'Милена',
      classLabel: '7 «Г»',
      schoolLabel: null,
      status: 'active',
      sharedWithOtherFamily: false,
      settings: { lowMark: null, dropStep: null, callAfter: null },
    },
    {
      studentId: 'kid-mark',
      name: 'Марк',
      classLabel: '1 «Д»',
      schoolLabel: null,
      status: 'active',
      sharedWithOtherFamily: true,
      settings: { lowMark: null, dropStep: null, callAfter: null },
    },
  ],
  joinRequests: [
    {
      id: 'jr-1',
      displayName: 'Папа',
      createdAt: '2026-10-20T10:00:00Z',
      diary: { providerName: 'Школьный портал (демо)', label: 'papa-login' },
    },
  ],
};

const TYPE_KEYS = new Set(['workType', 'workTypeRaw', 'lessonType']);
const untyped = (key: string, value: unknown) => (TYPE_KEYS.has(key) ? null : value);

export function fakeApi(start: Partial<FakeState> = {}) {
  const state: FakeState = { signedIn: false, calls: [], urls: [], bodies: {}, ...start };
  const error = (status: number, code: string) => json({ error: { code, message: code } }, status);
  let matchesPending = false;
  let familyGuidance = true;
  const avatars: Record<string, unknown> = {};
  const lessonState = { ready: new Set<string>(), cancelled: new Set<string>(), homework: new Map<string, string>() };
  const json = (body: unknown, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(body, state.noTypes ? untyped : undefined), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  vi.stubGlobal('fetch', async (target: Request | string, init?: RequestInit) => {
    // the API client sends a Request; an upload calls fetch(url, init) with its bytes
    const input = typeof target === 'string' ? new Request(new URL(target, 'http://localhost'), init) : target;
    const url = new URL(input.url);
    const route = `${input.method} ${url.pathname}`;
    state.calls.push(route);
    state.urls.push(route + url.search);
    if (input.method !== 'GET' && input.headers.get('content-type')?.includes('json'))
      state.bodies[route] = await input.clone().json();
    if (route === 'POST /api/auth/login') {
      const body = state.bodies[route] as { password: string };
      if (body.password !== 'correct horse battery')
        return json({ error: { code: 'wrong_login', message: 'Wrong login or password' } }, 401);
      state.signedIn = true;
      return json({ ok: true });
    }
    if (route === 'GET /api/providers') return json(PROVIDERS);
    if (route === 'POST /api/auth/connect') {
      if (state.diaryRefuses) return error(401, 'diary_auth_failed');
      state.signedIn = true;
      matchesPending = true;
      return json({ connect: { accountId: 'acc-1', matches: [{ studentId: 'kid-shared' }] } }, 201);
    }
    if (route === 'GET /api/invites/ABC123')
      return json({
        family: 'Семья',
        role: 'parent',
        students: [{ id: 'kid-mark', name: 'Марк' }],
        expiresAt: '2026-10-26T12:00:00Z',
      });
    if (route.startsWith('GET /api/invites/')) return error(410, 'invite_gone');
    if (route === 'POST /api/invites/ABC123/accept') {
      state.signedIn = true;
      return json({ ok: true }, 201);
    }
    if (!state.signedIn) return json({ error: { code: 'unauthorized', message: 'Sign in first' } }, 401);
    if (route === 'GET /api/auth/me')
      return json({
        user: {
          id: 'u1',
          login: 'parent@example.com',
          displayName: 'Родитель',
          locale: state.locale ?? 'ru',
          timezone: null,
          uiMode: 'full',
          guidance: state.guidance ?? true,
          appearance: {
            theme: 'light',
            background: 'color',
            palette: 'sea',
            wallpaper: 'cell',
            opacity: 35,
            font: 'manrope',
            hasOwnWallpaper: false,
            ...state.appearance,
          },
        },
        memberships: [{ familyId: 'f1', familyName: 'Семья', role: state.role ?? 'admin' }],
        family: { id: 'f1', name: 'Семья', role: state.role ?? 'admin' },
        students: state.role === 'student' ? KIDS.slice(0, 1) : KIDS,
      });
    if (route === 'POST /api/auth/logout') {
      state.signedIn = false;
      return json(null, 204);
    }
    if (route === 'GET /api/sync/status') return json(state.syncStatus ?? { accounts: [], students: [] });
    if (route === 'GET /api/sync/runs') return json(state.syncRuns ?? []);
    if (route === 'POST /api/sync/run')
      return json({ started: false, reason: 'interval', retryAt: '2026-10-21T17:12:00Z' });
    if (route === 'POST /api/sync/rescan')
      return json({ started: false, reason: 'interval', retryAt: '2026-10-21T17:12:00Z', weeks: 7 });
    if (route === 'GET /api/students') return json(CARDS);
    if (route === 'PATCH /api/me') return json({});
    if (route === 'PATCH /api/me/settings') {
      const body = state.bodies[route] as { guidance?: boolean; appearance?: Record<string, unknown> };
      state.guidance = body.guidance ?? state.guidance;
      if (body.appearance) state.appearance = { ...state.appearance, ...body.appearance };
      return json({});
    }
    if (route === 'PUT /api/me/wallpaper') {
      state.appearance = { ...state.appearance, hasOwnWallpaper: true };
      return json({ hasOwnWallpaper: true });
    }
    if (route === 'DELETE /api/me/wallpaper') {
      state.appearance = { ...state.appearance, hasOwnWallpaper: false, wallpaper: 'cell' };
      return json({}, 204);
    }
    if (route === 'GET /api/family')
      return json({
        ...FAMILY,
        family: { ...FAMILY.family, guidance: familyGuidance },
        children: FAMILY.children.map((c) => ({ ...c, avatar: avatars[c.studentId] ?? null })),
        matches: matchesPending ? [{ accountId: 'acc-1', studentId: 'kid-shared', name: 'Марк' }] : [],
      });
    if (route === 'PATCH /api/family') {
      familyGuidance = (state.bodies[route] as { guidance?: boolean }).guidance ?? familyGuidance;
      return json({});
    }
    if (/^PATCH \/api\/family\/join-requests\//.test(route)) return json(null, 204);
    if (route === 'POST /api/family/invites')
      return json({ code: 'K7M2Q9', url: '/join/K7M2Q9', expiresAt: '2026-10-23T16:12:00Z' }, 201);
    const kidPatch = route.match(/^PATCH \/api\/students\/([^/]+)$/);
    if (kidPatch) {
      const traits = (state.bodies[route] as { avatar: unknown }).avatar;
      avatars[kidPatch[1]!] = traits ? { kind: 'traits', traits } : null;
      return json({ avatar: avatars[kidPatch[1]!] });
    }
    if (route === 'POST /api/family/accounts/acc-1/matches/kid-shared') {
      matchesPending = false;
      return json({ outcome: 'followed' });
    }
    if (/^GET \/api\/students\/[^/]+\/periods$/.test(route)) return json(periods);
    const subj = route.match(/^(GET|PUT) \/api\/students\/([^/]+)\/subjects(?:\/([^/]+))?(?:\/(trend|color|goal))?$/);
    if (subj) {
      const [, method, id, sid, what] = subj;
      if (!sid) return json({ period: PERIOD, subjects: SUBJECTS[id as keyof typeof SUBJECTS] ?? [] });
      if (what === 'trend') return json({ period: PERIOD, buckets: [] });
      if (method === 'PUT' && what === 'color') return json(state.bodies[route]);
      if (method === 'PUT' && what === 'goal')
        return json({ goal: (state.bodies[route] as { termGoal: number | null }).termGoal });
      return json(state.subject ?? SUBJECT);
    }
    const more = route.match(/^GET \/api\/students\/([^/]+)\/(marks|finals\/quarters|finals\/years)$/);
    if (more) {
      const [, id, what] = more;
      if (what === 'marks') {
        // with feedPages, a second page of one older mark follows the first
        if (state.feedPages && url.searchParams.get('cursor') !== '0')
          return json({ period: PERIOD, items: [{ ...FEED[6], id: 'f-old', date: '2026-10-05' }], next: null });
        return json({ period: PERIOD, items: id === 'kid-milena' ? FEED : [], next: state.feedPages ? 100 : null });
      }
      return json(what === 'finals/quarters' ? TERM_FINALS : YEAR_FINALS);
    }
    // Расписание and the lesson menu: ticks, cancellations and own homework are kept for the next read
    if (/^GET \/api\/students\/[^/]+\/schedule\/days$/.test(route))
      return json({
        today: state.scheduleToday ?? '2026-10-21',
        weekStart: 1,
        schoolDays: [1, 2, 3, 4, 5],
        days: Object.entries(SCHEDULE_DAYS).map(([date, ls]) => ({ date, lessons: ls.length, held: ls.length })),
      });
    if (/^GET \/api\/students\/[^/]+\/schedule$/.test(route)) {
      const day = url.searchParams.get('day');
      const week = url.searchParams.get('week');
      const dates = day ? [day] : week === '0' ? Object.keys(SCHEDULE_DAYS) : [];
      const days = dates
        .filter((d) => SCHEDULE_DAYS[d])
        .map((date) => ({
          date,
          lessons: SCHEDULE_DAYS[date]!.map((l) => ({
            ...l,
            notes: 'notes' in l ? l.notes : null,
            ready: lessonState.ready.has(l.id)
              ? { at: '2026-10-21T16:12:00Z', by: { name: 'Родитель', otherFamily: false } }
              : null,
            cancelled: lessonState.cancelled.has(l.id),
            ownHomework: lessonState.homework.has(l.id)
              ? [{ id: `hw-${l.id}`, text: lessonState.homework.get(l.id)!, by: null }]
              : [],
          })),
        }));
      return json({
        from: dates[0] ?? '2026-10-19',
        to: dates.at(-1) ?? '2026-10-25',
        days,
        attention: dates.includes('2026-10-22') && !lessonState.cancelled.has('l4') ? SCHEDULE_ATTENTION : [],
      });
    }
    const act = route.match(/^(PUT|DELETE|POST) \/api\/students\/[^/]+\/lessons\/([^/]+)\/(prep|cancel|homework)$/);
    if (act) {
      const [, method, lessonId, what] = act;
      if (state.lessonRefuses) return error(409, state.lessonRefuses);
      if (what === 'prep') {
        if (method === 'PUT') lessonState.ready.add(lessonId!);
        else lessonState.ready.delete(lessonId!);
        return json({ done: method === 'PUT', doneAt: null, doneBy: null });
      }
      if (what === 'cancel') {
        if (method === 'PUT') lessonState.cancelled.add(lessonId!);
        else lessonState.cancelled.delete(lessonId!);
        return json({ cancelled: method === 'PUT', setAt: null });
      }
      const text = (state.bodies[route] as { text: string }).text;
      lessonState.homework.set(lessonId!, text);
      return json({ id: `hw-${lessonId}`, text });
    }
    const item = route.match(/^(PATCH|DELETE) \/api\/students\/[^/]+\/homework\/hw-([^/]+)$/);
    if (item) {
      const [, method, lessonId] = item;
      if (method === 'PATCH') lessonState.homework.set(lessonId!, (state.bodies[route] as { text: string }).text);
      else lessonState.homework.delete(lessonId!);
      return json(
        method === 'PATCH' ? { id: `hw-${lessonId}`, text: lessonState.homework.get(lessonId!) } : { removed: true },
      );
    }
    const kid = route.match(/^GET \/api\/students\/([^/]+)\/(overview|trend|events|school)$/);
    if (kid) {
      const [, id, what] = kid;
      if (what === 'overview') return json({ nearGoals: null, ...(OVERVIEW[id!] as object), ...state.overview });
      if (what === 'trend') return json(id === 'kid-milena' ? TREND : { period: PERIOD, buckets: [] });
      if (what === 'events')
        return json(
          id === 'kid-milena'
            ? { period: PERIOD, items: EVENTS, total: EVENTS.length }
            : { period: PERIOD, items: [], total: 0 },
        );
      return json(SCHOOL);
    }
    throw new Error(`fake API: no route ${route}`);
  });
  return state;
}
