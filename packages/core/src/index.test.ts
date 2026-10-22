import { describe, expect, it } from 'vitest';
import { roundHalfUp } from './index';

describe('roundHalfUp', () => {
  it('rounds half up', () => {
    expect(roundHalfUp(7.5)).toBe(8);
    expect(roundHalfUp(7.45, 1)).toBe(7.5);
    expect(roundHalfUp(6.44, 1)).toBe(6.4);
  });
});
