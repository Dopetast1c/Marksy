import { fileURLToPath } from 'node:url';
import { defineConformanceSuite } from '@marksy/core/conformance';
import { ROUTES, templateProvider } from './index';

// Run with `pnpm test:provider <id>`. Fails until the provider and its fixtures are filled in.
defineConformanceSuite({
  provider: templateProvider,
  fixturesDir: fileURLToPath(new URL('../fixtures', import.meta.url)),
  routes: ROUTES,
});
