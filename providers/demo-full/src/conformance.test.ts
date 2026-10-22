import { fileURLToPath } from 'node:url';
import { defineConformanceSuite } from '@marksy/core/conformance';
import { DEMO_FULL_ROUTES, demoFull } from './index';

defineConformanceSuite({
  provider: demoFull,
  fixturesDir: fileURLToPath(new URL('../fixtures', import.meta.url)),
  routes: DEMO_FULL_ROUTES,
  range: { from: '2025-09-08', to: '2025-09-21' },
});
