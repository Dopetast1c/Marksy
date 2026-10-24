import { getScale } from '@marksy/core';
import { vi } from 'vitest';

// A fake of the Marksy API for screen tests: a session flag and fictional data (D16: the demo family's names). Every
// request the app makes goes through it; an unknown route is a test failure, not a silent 404.

export interface FakeState {
  signedIn: boolean;
  calls: string[];
  /** request bodies by route, last one wins */
  bodies: Record<string, unknown>;
  /** the connected diary refuses the login */
  diaryRefuses?: boolean;
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
    capabilities: { lessons: true, futureTimetable: true, bellSchedule: true, attendance: 'derived' },
    gradingScale: scale,
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
  terms: [],
  holidays: [],
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
};

export function fakeApi(start: Partial<FakeState> = {}) {
  const state: FakeState = { signedIn: false, calls: [], bodies: {}, ...start };
  const error = (status: number, code: string) => json({ error: { code, message: code } }, status);
  let matchesPending = false;
  const json = (body: unknown, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  vi.stubGlobal('fetch', async (input: Request) => {
    const url = new URL(input.url);
    const route = `${input.method} ${url.pathname}`;
    state.calls.push(route);
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
          locale: 'ru',
          timezone: null,
          uiMode: 'full',
        },
        memberships: [{ familyId: 'f1', familyName: 'Семья', role: 'admin' }],
        family: { id: 'f1', name: 'Семья', role: 'admin' },
        students: KIDS,
      });
    if (route === 'POST /api/auth/logout') {
      state.signedIn = false;
      return json(null, 204);
    }
    if (route === 'GET /api/sync/status') return json({ accounts: [], students: [] });
    if (route === 'GET /api/students') return json(CARDS);
    if (route === 'PATCH /api/me') return json({});
    if (route === 'GET /api/family')
      return json({
        matches: matchesPending ? [{ accountId: 'acc-1', studentId: 'kid-shared', name: 'Марк' }] : [],
      });
    if (route === 'POST /api/family/accounts/acc-1/matches/kid-shared') {
      matchesPending = false;
      return json({ outcome: 'followed' });
    }
    if (/^GET \/api\/students\/[^/]+\/periods$/.test(route)) return json(periods);
    const kid = route.match(/^GET \/api\/students\/([^/]+)\/(overview|trend|events|school)$/);
    if (kid) {
      const [, id, what] = kid;
      if (what === 'overview') return json(OVERVIEW[id!]);
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
