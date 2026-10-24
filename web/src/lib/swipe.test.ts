import { describe, expect, it } from 'vitest';
import { swipeIgnored, swipeStep } from './swipe';

describe('the period swipe', () => {
  it('48 px sideways with less than half of it vertically', () => {
    expect(swipeStep(48, 0)).toBe(1); // finger to the right: older
    expect(swipeStep(-60, 20)).toBe(-1); // to the left: newer
    expect(swipeStep(47, 0)).toBe(0); // too short
    expect(swipeStep(80, 40)).toBe(0); // half of it vertical: a scroll
    expect(swipeStep(80, 39)).toBe(1);
  });

  it('is not ours inside a horizontal scroller or while a sheet is open', () => {
    document.body.innerHTML =
      '<main id="root"><div data-hscroll><button id="chip">x</button></div><p id="text">t</p></main>';
    const root = document.getElementById('root')!;
    expect(swipeIgnored(document.getElementById('chip'), root)).toBe(true);
    expect(swipeIgnored(document.getElementById('text'), root)).toBe(false);
    document.body.dataset.sheetOpen = 'true';
    expect(swipeIgnored(document.getElementById('text'), root)).toBe(true);
    delete document.body.dataset.sheetOpen;
  });
});
