import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMemoryDrift, driftChecker } from '@marksy/core';
import { describe, expect, it } from 'vitest';
import { manifest } from './index';
import { mapLessonsResponse } from './map';

// The rare response shapes met in real responses (docs/providers.md 8): each is kept as its own sanitised fixture in
// fixtures/cases/, which no probe ever writes, so a shape seen once stays tested after the regular fixtures have been
// replaced by newer weeks. A case names its endpoint and what the mapping must make of it.

interface Case {
  about: string;
  seen: string;
  endpoint: 'lessons';
  apiSpec: string;
  response: unknown;
  expect: { lessons: number; marks: number; attendance: number; behaviour: string[]; drift: string[] };
}

const dir = fileURLToPath(new URL('../fixtures/cases', import.meta.url));
const cases = readdirSync(dir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => [f, JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')) as Case] as const);

describe('rare response shapes (fixtures/cases)', () => {
  it('there are cases, each with what it is, when it was seen and what it must become', () => {
    expect(cases.length).toBeGreaterThan(0);
    for (const [file, c] of cases) {
      expect(c.about, file).toBeTruthy();
      expect(c.seen, file).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.apiSpec, file).toBeTruthy();
    }
  });

  it.each(cases)('%s', (_file, c) => {
    const drift = createMemoryDrift();
    const check = driftChecker(drift, c.endpoint);
    expect(c.endpoint).toBe('lessons');
    const lessons = mapLessonsResponse(c.response, manifest.timezone, check);
    expect({
      lessons: lessons.length,
      marks: lessons.flatMap((l) => l.marks).length,
      attendance: lessons.flatMap((l) => l.attendance ?? []).length,
      behaviour: lessons.flatMap((l) => l.behaviour ?? []).map((b) => b.category),
      drift: drift.events.map((e) => `${e.kind} ${e.path}`),
    }).toEqual(c.expect);
  });
});
