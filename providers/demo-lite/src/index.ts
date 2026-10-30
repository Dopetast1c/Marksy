import { createDemoProvider, demoTransportOf } from '@marksy/demo-diary';
import type { TransportRequest } from '@marksy/core';
import manifestJson from '../provider.json';
import auth from '../fixtures/auth.json';
import bells1 from '../fixtures/bells-1.json';
import diary1w1 from '../fixtures/diary-1-w1.json';
import diary1w2 from '../fixtures/diary-1-w2.json';
import diaryEmpty from '../fixtures/diary-empty.json';
import profile from '../fixtures/profile.json';
import routes from '../fixtures/routes.json';
import subjects1 from '../fixtures/subjects-1.json';
import timetable1 from '../fixtures/timetable-1.json';
import year1 from '../fixtures/year-1.json';

// demo-lite: the fictional demo diary (packages/demo-diary) as a thinner system, the prototype's "другой дневник":
// lessons, quarters, bells, the regular week and teachers, but no lesson or work types, no attendance, no rooms, no
// subgroups and no finals. In the seeded demo family Марк goes to this school. Its fixtures are written from the
// shared fictional school (pnpm --filter @marksy/demo-diary fixtures) and imported here, so the server image carries
// them inside its bundle and reads nothing from disk.

export const demoLite = createDemoProvider(manifestJson);
export const manifest = demoLite.manifest;

export const DEMO_LITE_ROUTES = routes as Record<string, string>;
export const DEMO_LITE_FIXTURES: Readonly<Record<string, unknown>> = {
  auth,
  'bells-1': bells1,
  'diary-1-w1': diary1w1,
  'diary-1-w2': diary1w2,
  'diary-empty': diaryEmpty,
  profile,
  'subjects-1': subjects1,
  'timetable-1': timetable1,
  'year-1': year1,
};

export function demoLiteTransport(opts: { fixtures?: Record<string, unknown>; log?: TransportRequest[] } = {}) {
  return demoTransportOf(DEMO_LITE_FIXTURES, DEMO_LITE_ROUTES, opts);
}
