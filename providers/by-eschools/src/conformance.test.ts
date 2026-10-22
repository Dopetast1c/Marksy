import { fileURLToPath } from 'node:url';
import { defineConformanceSuite } from '@marksy/core/conformance';
import { byEschools } from './index';

// Routes come from fixtures/routes.json, written with the fixtures (by hand for the fictional set, by `pnpm probe`
// for sanitised real ones). The range covers the fixture weeks: the API hands out lessons one week at a time.
defineConformanceSuite({
  provider: byEschools,
  fixturesDir: fileURLToPath(new URL('../fixtures', import.meta.url)),
  range: { from: '2026-10-05', to: '2026-10-18' },
});
