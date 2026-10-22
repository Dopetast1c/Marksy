import { readFileSync } from 'node:fs';
import { CATALOGS } from '@marksy/i18n';
import { describe, expect, it } from 'vitest';
import { BUILT_IN_SCALES } from './grading/scales';
import { lessonType, markKind, termKind, workType } from './model/schemas';

// Every key core hands to the interface must exist in the source catalog (docs/i18n.md 2).

const en = CATALOGS.en!;

describe('i18n keys used by core', () => {
  it('scale names and band labels', () => {
    for (const s of Object.values(BUILT_IN_SCALES)) {
      expect(en).toHaveProperty([s.nameKey]);
      for (const b of Object.values(s.bands)) if (b) expect(en).toHaveProperty([b.labelKey]);
    }
  });

  it('canonical enums', () => {
    for (const v of workType.options) expect(en).toHaveProperty([`workType.${v}`]);
    for (const v of lessonType.options) expect(en).toHaveProperty([`lessonType.${v}`]);
    for (const v of markKind.options) expect(en).toHaveProperty([`markKind.${v}`]);
    for (const v of termKind.options) expect(en).toHaveProperty([`term.${v}`]);
  });

  it('guidance facts and advice', () => {
    const source = readFileSync(new URL('./guidance/guidance.ts', import.meta.url), 'utf8');
    const keys = [...source.matchAll(/'(guidance\.[\w.]+)'/g)].map((m) => m[1]!);
    expect(keys.length).toBeGreaterThan(20);
    expect(keys.filter((k) => !(k in en))).toEqual([]);
  });
});
