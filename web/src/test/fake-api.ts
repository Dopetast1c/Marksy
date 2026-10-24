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
    capabilities: { attendance: true },
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
});

const periods = {
  today: '2026-10-21',
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
        matches: matchesPending ? [{ accountId: 'acc-1', studentId: 'kid-shared', name: 'Ева' }] : [],
      });
    if (route === 'POST /api/family/accounts/acc-1/matches/kid-shared') {
      matchesPending = false;
      return json({ outcome: 'followed' });
    }
    if (/^GET \/api\/students\/[^/]+\/periods$/.test(route)) return json(periods);
    throw new Error(`fake API: no route ${route}`);
  });
  return state;
}
