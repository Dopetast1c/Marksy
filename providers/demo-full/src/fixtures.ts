import { createFixtureTransport } from '@marksy/core';
import type { TransportRequest } from '@marksy/core';
import auth from '../fixtures/auth.json';
import diary1w1 from '../fixtures/diary-1-w1.json';
import diary1w2 from '../fixtures/diary-1-w2.json';
import diary2w1 from '../fixtures/diary-2-w1.json';
import diaryEmpty from '../fixtures/diary-empty.json';
import finals1 from '../fixtures/finals-1.json';
import finals2 from '../fixtures/finals-2.json';
import profile from '../fixtures/profile.json';
import subjects1 from '../fixtures/subjects-1.json';
import subjects2 from '../fixtures/subjects-2.json';
import year1 from '../fixtures/year-1.json';
import year2 from '../fixtures/year-2.json';

// The demo diary's API is its fixtures. Two pupils: p-1 in grade 7 with marks for the weeks of 8 and 15 September
// 2025, p-2 in grade 1 without marks. Every other week is empty. Routes are matched in order.
export const DEMO_FULL_ROUTES: Record<string, string> = {
  'POST /api/v2/auth': 'auth',
  'GET /api/v2/profile': 'profile',
  'GET /api/v2/pupils/p-1/year': 'year-1',
  'GET /api/v2/pupils/p-2/year': 'year-2',
  'GET /api/v2/pupils/p-1/subjects': 'subjects-1',
  'GET /api/v2/pupils/p-2/subjects': 'subjects-2',
  'GET /api/v2/pupils/p-1/diary?week=2025-09-08': 'diary-1-w1',
  'GET /api/v2/pupils/p-1/diary?week=2025-09-15': 'diary-1-w2',
  'GET /api/v2/pupils/p-2/diary?week=2025-09-08': 'diary-2-w1',
  'GET /api/v2/pupils/*/diary': 'diary-empty',
  'GET /api/v2/pupils/p-1/finals': 'finals-1',
  'GET /api/v2/pupils/p-2/finals': 'finals-2',
};

export const DEMO_FULL_FIXTURES: Readonly<Record<string, unknown>> = {
  auth,
  profile,
  'year-1': year1,
  'year-2': year2,
  'subjects-1': subjects1,
  'subjects-2': subjects2,
  'diary-1-w1': diary1w1,
  'diary-1-w2': diary1w2,
  'diary-2-w1': diary2w1,
  'diary-empty': diaryEmpty,
  'finals-1': finals1,
  'finals-2': finals2,
};

/**
 * A transport for the throttled client that answers like the demo diary. Collector tests pass `fixtures` to replace
 * one response (a changed mark, a lesson that got its id) and `log` to see the requests.
 */
export function demoFullTransport(opts: { fixtures?: Record<string, unknown>; log?: TransportRequest[] } = {}) {
  return createFixtureTransport({
    fixtures: { ...DEMO_FULL_FIXTURES, ...opts.fixtures },
    routes: DEMO_FULL_ROUTES,
    ...(opts.log && { log: opts.log }),
  });
}
