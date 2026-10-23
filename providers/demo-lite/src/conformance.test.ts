import { fileURLToPath } from 'node:url';
import { defineConformanceSuite } from '@marksy/core/conformance';
import { describe, expect, it } from 'vitest';
import { DEMO_LITE_FIXTURES, DEMO_LITE_ROUTES, demoLite } from './index';

defineConformanceSuite({
  provider: demoLite,
  fixturesDir: fileURLToPath(new URL('../fixtures', import.meta.url)),
  routes: DEMO_LITE_ROUTES,
  range: { from: '2026-10-05', to: '2026-10-17' },
});

describe('demo-lite is the thinner system', () => {
  it('has no finals method and drops what it does not promise', () => {
    expect(demoLite.getFinalMarks).toBeUndefined();
    expect(typeof demoLite.getBellSchedule).toBe('function');
    // the shared fictional school has rooms; this system does not show them
    expect(JSON.stringify(DEMO_LITE_FIXTURES['timetable-1'])).toContain('"room"');
  });
});
