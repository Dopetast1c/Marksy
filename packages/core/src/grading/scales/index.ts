import type { GradingScale } from '../types';
import { by10 } from './by-10';
import { de16 } from './de-1-6';
import { pct100 } from './pct-100';
import { ru5 } from './ru-5';
import { ua12 } from './ua-12';

// Built-in scales (docs/providers.md 5.2). A new one is a file here, a line below and a test pinning its bands.
export const BUILT_IN_SCALES: Readonly<Record<string, GradingScale>> = Object.fromEntries(
  [by10, ru5, ua12, de16, pct100].map((s) => [s.id, s]),
);

export { by10, de16, pct100, ru5, ua12 };
