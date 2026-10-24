import { describe, expect, it } from 'vitest';
import { PICK_AFTER_MS, restoredChild } from './pick';

const now = Date.parse('2026-10-19T18:00:00Z');
const base = { alwaysLast: false, now, childIds: ['a', 'b'], role: 'parent' as const };

describe('the picker rule', () => {
  it('continues on the child chosen within 12 hours, asks again after', () => {
    expect(restoredChild({ id: 'b', lastActive: now - PICK_AFTER_MS }, base)).toBe('b');
    expect(restoredChild({ id: 'b', lastActive: now - PICK_AFTER_MS - 1 }, base)).toBeNull();
    expect(restoredChild(null, base)).toBeNull();
  });

  it('«Всегда начинать с последнего» keeps the child however long ago', () => {
    expect(restoredChild({ id: 'a', lastActive: now - 30 * PICK_AFTER_MS }, { ...base, alwaysLast: true })).toBe('a');
  });

  it('a child no longer in the family is never restored', () => {
    expect(restoredChild({ id: 'gone', lastActive: now }, { ...base, alwaysLast: true })).toBeNull();
  });

  it('one child or a student: no picker at all', () => {
    expect(restoredChild(null, { ...base, childIds: ['a'] })).toBe('a');
    expect(restoredChild(null, { ...base, role: 'student', childIds: ['me'] })).toBe('me');
  });
});
