import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { swipeIgnored, swipeStep } from '../lib/swipe';

/**
 * Calls onStep(+1 older | -1 newer) for a period swipe over the element (lib/swipe.ts) and swallows the click the
 * browser fires after it, so a swipe never also opens the row under the finger.
 */
export function useSwipe(ref: RefObject<HTMLElement | null>, onStep: (step: 1 | -1) => void) {
  const handler = useRef(onStep);
  useEffect(() => {
    handler.current = onStep;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let start: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      start = swipeIgnored(e.target as Element, el) ? null : { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      if (!start) return;
      const step = swipeStep(e.clientX - start.x, e.clientY - start.y);
      start = null;
      if (!step) return;
      const swallow = (c: MouseEvent) => {
        c.stopPropagation();
        c.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      // a swipe that ends outside any clickable thing produces no click: stop waiting for it
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 400);
      handler.current(step);
    };
    const cancel = () => {
      start = null;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
  }, [ref]);
}
