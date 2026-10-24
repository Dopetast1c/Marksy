// How many avatars the StudentBar shows (docs/design.md 4, ux-principles D8): as many as fit between the title (which
// keeps at least 140 px) and the right edge, the rest in a "+N" circle. The order is the family order; when the
// active child would be hidden it takes the last visible place instead, so it is always on screen.

export const TITLE_MIN_PX = 140;
export const AVATAR_SLOT_PX = 44;
export const MORE_PX = 38;

export function fitAvatars(opts: { count: number; active: number; available: number }): {
  visible: number[];
  rest: number;
} {
  const { count, active } = opts;
  let n = Math.max(1, Math.floor(opts.available / AVATAR_SLOT_PX));
  if (n < count) n = Math.max(1, Math.floor((opts.available - MORE_PX) / AVATAR_SLOT_PX));
  n = Math.min(n, count);
  const visible = Array.from({ length: n }, (_, i) => i);
  if (active >= n && n > 0) visible[n - 1] = active;
  return { visible: visible.sort((a, b) => a - b), rest: count - n };
}
