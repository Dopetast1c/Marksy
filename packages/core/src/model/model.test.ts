import { describe, expect, it } from 'vitest';
import { providerManifest } from '../providers/manifest';
import { createRegistry } from '../providers/registry';
import type { DiaryProvider } from '../providers/types';
import { sampleManifest } from '../testing/samples';
import { displayNameOf } from './names';
import { calendar, lesson, mark } from './schemas';

const sampleMark = {
  externalId: 'm1',
  date: '2026-10-12',
  subjectExternalId: 's1',
  subjectName: 'Algebra',
  raw: '7/9',
  kind: 'numeric',
  values: [7, 9],
};

describe('canonical schemas', () => {
  it('accept a lesson with a double mark', () => {
    const l = lesson.parse({
      externalId: 'l1',
      date: '2026-10-12',
      slot: 2,
      subjectExternalId: 's1',
      subjectName: 'Algebra',
      marks: [sampleMark],
    });
    expect(l.marks[0]?.values).toEqual([7, 9]);
  });

  it('tolerate unknown fields and drop them', () => {
    const m = mark.parse({ ...sampleMark, somethingNew: 1 });
    expect(m).not.toHaveProperty('somethingNew');
  });

  it('reject broken input', () => {
    expect(mark.safeParse({ ...sampleMark, date: '12.10.2026' }).success).toBe(false);
    expect(mark.safeParse({ ...sampleMark, kind: 'absent' }).success).toBe(false);
    expect(mark.safeParse({ ...sampleMark, externalId: '' }).success).toBe(false);
  });

  it('let a school year have no marks (scale null) or the manifest default (absent)', () => {
    const base = {
      schoolYear: { externalId: 'y', label: '2026/27', start: '2026-09-01', end: '2027-05-31' },
      terms: [],
    };
    expect(calendar.parse({ ...base, gradingScaleId: null }).gradingScaleId).toBeNull();
    expect(calendar.parse(base).gradingScaleId).toBeUndefined();
  });
});

describe('manifest', () => {
  it('validates the sample', () => {
    expect(providerManifest.parse(sampleManifest).id).toBe('xx-sample');
  });

  it('rejects an allow-list entry without a method', () => {
    expect(providerManifest.safeParse({ ...sampleManifest, readOnlyAllowList: ['/diary/**'] }).success).toBe(false);
  });
});

describe('displayNameOf', () => {
  const s = { externalId: '1', fullName: 'Lee Ana Maria' };
  it('prefers displayName, then givenName', () => {
    expect(displayNameOf({ ...s, displayName: 'Annie' }, 'given-first')).toBe('Annie');
    expect(displayNameOf({ ...s, givenName: 'Ana' }, 'given-first')).toBe('Ana');
  });
  it('takes the given name from fullName by name order', () => {
    expect(displayNameOf({ ...s, fullName: 'Ana Lee' }, 'given-first')).toBe('Ana');
    expect(displayNameOf(s, 'family-first')).toBe('Ana');
    expect(displayNameOf({ ...s, fullName: 'Ana' }, 'family-first')).toBe('Ana');
  });
});

describe('registry', () => {
  const provider = (id: string, status: 'beta' | 'experimental' = 'beta'): DiaryProvider =>
    ({ manifest: { ...sampleManifest, id, status } }) as unknown as DiaryProvider;

  it('offers stable and beta providers, keeps the rest reachable by id', () => {
    const r = createRegistry([provider('xx-one'), provider('xx-two', 'experimental')]);
    expect(r.list().map((p) => p.manifest.id)).toEqual(['xx-one']);
    expect(r.list({ all: true })).toHaveLength(2);
    expect(r.get('xx-two')?.manifest.status).toBe('experimental');
    expect(r.get('nope')).toBeUndefined();
  });

  it('refuses duplicates and invalid manifests', () => {
    expect(() => createRegistry([provider('xx-one'), provider('xx-one')])).toThrow(/twice/);
    expect(() => createRegistry([provider('Not An Id')])).toThrow(/invalid/);
  });
});
