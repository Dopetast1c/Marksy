import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConformanceSuite } from '@marksy/core/conformance';
import { dayRange } from './dates';
import { byEschools, manifest } from './index';

// Routes come from fixtures/routes.json, written with the fixtures (by hand for the fictional set, by `pnpm probe`
// for sanitised real ones). The API hands out lessons one week at a time, so the read covers exactly the weeks the
// lesson routes name, whichever weeks those are.
const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));
const read = (name: string): unknown => JSON.parse(readFileSync(`${fixturesDir}/${name}.json`, 'utf8'));

const routes = read('routes') as Record<string, string>;
const weekIds = new Set(
  Object.keys(routes).flatMap((r) => [...new URL(r.split(' ')[1]!, 'https://x').searchParams.values()]),
);
const weeks = (read('week_activities') as { uuid: string; start_ts: number; end_ts: number }[])
  .filter((w) => weekIds.has(w.uuid))
  .map((w) => dayRange({ start: w.start_ts, end: w.end_ts }, manifest.timezone))
  .sort((a, b) => a.from.localeCompare(b.from));

defineConformanceSuite({
  provider: byEschools,
  fixturesDir,
  ...(weeks.length && { range: { from: weeks[0]!.from, to: weeks.at(-1)!.to } }),
});
