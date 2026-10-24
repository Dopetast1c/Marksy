// The period swipe (docs/design.md 6, CLAUDE.md "PeriodNav"): a horizontal swipe over the body steps one instance,
// finger to the right = older, to the left = newer. Only a travel of 48 px or more with less than half of it
// vertically counts; anything else is a scroll or a tap.

export const SWIPE_MIN_PX = 48;

/** +1 older, -1 newer, 0 not a swipe */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) * 2 >= Math.abs(dx)) return 0;
  return dx > 0 ? 1 : -1;
}

/** A swipe that starts inside a horizontal scroller (chips, segmented controls) or an open sheet is not ours */
export function swipeIgnored(target: Element | null, root: Element): boolean {
  if (document.body.dataset.sheetOpen === 'true') return true;
  for (let el = target; el && el !== root; el = el.parentElement) {
    if (el instanceof HTMLElement && el.dataset.hscroll !== undefined) return true;
    if (el.scrollWidth > el.clientWidth) {
      const x = getComputedStyle(el).overflowX;
      if (x === 'auto' || x === 'scroll') return true;
    }
  }
  return false;
}
