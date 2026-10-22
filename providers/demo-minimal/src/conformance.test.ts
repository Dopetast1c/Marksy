import { fileURLToPath } from 'node:url';
import { defineConformanceSuite } from '@marksy/core/conformance';
import { DEMO_ROUTES, demoMinimal } from './index';

defineConformanceSuite({
  provider: demoMinimal,
  fixturesDir: fileURLToPath(new URL('../fixtures', import.meta.url)),
  routes: DEMO_ROUTES,
});
