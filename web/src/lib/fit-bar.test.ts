import { describe, expect, it } from 'vitest';
import { fitAvatars } from './fit-bar';

describe('StudentBar fitting', () => {
  it('everyone on a wide screen', () => {
    expect(fitAvatars({ count: 3, active: 2, available: 400 })).toEqual({ visible: [0, 1, 2], rest: 0 });
  });

  it('a narrow phone: as many as fit, then +N; the active child stays in its own place', () => {
    // 130 px: three slots would fit, but with the +N circle only two
    expect(fitAvatars({ count: 5, active: 0, available: 130 })).toEqual({ visible: [0, 1], rest: 3 });
    expect(fitAvatars({ count: 5, active: 4, available: 130 })).toEqual({ visible: [0, 4], rest: 3 });
  });

  it('at least the active child, however small the space', () => {
    expect(fitAvatars({ count: 2, active: 1, available: 10 })).toEqual({ visible: [1], rest: 1 });
  });
});
