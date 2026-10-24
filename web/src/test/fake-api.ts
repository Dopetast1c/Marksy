import { vi } from 'vitest';

// A fake of the Marksy API for screen tests: a session flag and fictional data (D16: the demo family's names). Every
// request the app makes goes through it; an unknown route is a test failure, not a silent 404.

export interface FakeState {
  signedIn: boolean;
  calls: string[];
}

const scale = {
  id: 'by-10',
  nameKey: 'scale.by-10.name',
  min: 1,
  max: 10,
  step: 1,
  higherIsBetter: true,
};

export const KIDS = [
  {
    id: 'kid-milena',
    name: 'Милена',
    classLabel: '7 «Г»',
    grade: 7,
    schoolLabel: null,
    timezone: 'Europe/Minsk',
    providerId: 'demo-full',
    capabilities: {},
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
  const state: FakeState = { signedIn: false, calls: [], ...start };
  const json = (body: unknown, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  vi.stubGlobal('fetch', async (input: Request) => {
    const url = new URL(input.url);
    const route = `${input.method} ${url.pathname}`;
    state.calls.push(route);
    if (route === 'POST /api/auth/login') {
      const body = (await input.json()) as { password: string };
      if (body.password !== 'correct horse battery')
        return json({ error: { code: 'wrong_login', message: 'Wrong login or password' } }, 401);
      state.signedIn = true;
      return json({ ok: true });
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
    if (/^GET \/api\/students\/[^/]+\/periods$/.test(route)) return json(periods);
    throw new Error(`fake API: no route ${route}`);
  });
  return state;
}
