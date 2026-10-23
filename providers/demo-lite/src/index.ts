import { createDemoProvider, demoTransportOf } from '@marksy/demo-diary';
import type { TransportRequest } from '@marksy/core';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import manifestJson from '../provider.json';

// demo-lite: the fictional demo diary (packages/demo-diary) as a thinner system, the prototype's "другой дневник":
// lessons, quarters, bells, the regular week and teachers, but no lesson or work types, no attendance, no rooms, no
// subgroups and no finals. In the seeded demo family Марк goes to this school. Its fixtures are written from the
// shared fictional school (pnpm --filter @marksy/demo-diary fixtures).

export const demoLite = createDemoProvider(manifestJson);
export const manifest = demoLite.manifest;

const dir = fileURLToPath(new URL('../fixtures/', import.meta.url));
const json = (file: string) => JSON.parse(readFileSync(`${dir}${file}`, 'utf8')) as unknown;

export const DEMO_LITE_ROUTES = json('routes.json') as Record<string, string>;
export const DEMO_LITE_FIXTURES: Readonly<Record<string, unknown>> = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith('.json') && f !== 'routes.json' && f !== 'denylist.json')
    .map((f) => [f.slice(0, -5), json(f)]),
);

export function demoLiteTransport(opts: { fixtures?: Record<string, unknown>; log?: TransportRequest[] } = {}) {
  return demoTransportOf(DEMO_LITE_FIXTURES, DEMO_LITE_ROUTES, opts);
}
