import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// The fixtures' "now" (fake-api.ts: today is Wednesday 21 October 2026, 19:12 at the school): whether a lesson has
// passed depends on the clock (core's lessonPassed), so the screens are tested at a fixed instant. Only Date is faked:
// promises and timers run as usual.
export const FIXTURE_NOW = new Date('2026-10-21T16:12:00Z');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(FIXTURE_NOW);
});

afterEach(() => {
  vi.useRealTimers();
  // the script tests run in node, without a DOM
  if (typeof document === 'undefined') return;
  cleanup();
  localStorage.clear();
});
