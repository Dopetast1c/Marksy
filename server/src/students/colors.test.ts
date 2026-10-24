import { describe, expect, it } from 'vitest';
import tokens from '../../../docs/tokens.json';
import { SUBJECT_COLORS } from './colors';

describe('subject palette', () => {
  it('is the twelve colours of docs/tokens.json', () => {
    const keys = Object.entries(tokens.color.subject)
      .filter(([, v]) => typeof v === 'number' || v === null)
      .map(([k]) => k);
    expect([...SUBJECT_COLORS]).toEqual(keys);
  });
});
