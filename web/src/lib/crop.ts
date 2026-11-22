// The crop of a child's photo avatar (docs/design.md 5.6, ux-principles D62), as pure functions. The editor shows the
// photo under a round cut-out of diameter `d` CSS px; a view is the zoom and the point of the photo (in its own,
// already oriented pixels) that sits at the centre of the circle. At zoom 1 the photo's shorter side spans the circle
// exactly, so the circle is always covered; the view is clamped so that no edge of the photo comes inside it.

export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface View {
  zoom: number;
  /** the photo's point under the centre of the circle, in source pixels */
  cx: number;
  cy: number;
}

/** The largest zoom, whatever the photo */
export const MAX_ZOOM = 4;
/** The largest avatar (88 CSS px on the child's screen in Family) on a 3× screen: what "sharp" needs */
export const AVATAR_SHARP_PX = 88 * 3;
/** The square the browser draws and sends: the sharp size with room to spare, and the server's limit (14.1) */
export const AVATAR_OUTPUT_PX = 512;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** CSS px per source pixel at this zoom */
export const scaleOf = (src: Size, d: number, zoom: number) => (zoom * d) / Math.min(src.w, src.h);

/** 4×, or less when the photo has too few pixels for the avatar to stay sharp; never below 1 */
export function maxZoom(src: Size, sharpPx = AVATAR_SHARP_PX): number {
  return clamp(Math.min(src.w, src.h) / sharpPx, 1, MAX_ZOOM);
}

/** The start: the photo centred and zoomed just to cover the circle */
export const coverView = (src: Size): View => ({ zoom: 1, cx: src.w / 2, cy: src.h / 2 });

/** Where the centre may be at this zoom so that the circle stays inside the photo */
function centreRange(src: Size, zoom: number) {
  const half = Math.min(src.w, src.h) / (2 * zoom);
  return { x: [half, src.w - half] as const, y: [half, src.h - half] as const };
}

/** The view within its limits: zoom between 1 and the photo's maximum, no edge inside the circle */
export function clampView(v: View, src: Size, zmax = maxZoom(src)): View {
  const zoom = clamp(v.zoom, 1, zmax);
  const r = centreRange(src, zoom);
  return { zoom, cx: clamp(v.cx, r.x[0], r.x[1]), cy: clamp(v.cy, r.y[0], r.y[1]) };
}

/**
 * The source point that was under `from` (CSS px from the circle's centre) in `v` comes under `to` at `zoom`: a drag
 * (same zoom), a zoom around the cursor (from = to) and a pinch (both change) are all this one move. Clamped.
 */
export function anchor(v: View, src: Size, d: number, from: Point, to: Point, zoom: number, zmax = maxZoom(src)): View {
  const z = clamp(zoom, 1, zmax);
  const s0 = scaleOf(src, d, v.zoom);
  const s1 = scaleOf(src, d, z);
  return clampView({ zoom: z, cx: v.cx + from.x / s0 - to.x / s1, cy: v.cy + from.y / s0 - to.y / s1 }, src, zmax);
}

/** Zoom keeping the point under `at` (CSS px from the circle's centre) in place */
export const zoomAt = (v: View, src: Size, d: number, zoom: number, at: Point, zmax = maxZoom(src)) =>
  anchor(v, src, d, at, at, zoom, zmax);

/** Move the photo by (dx, dy) CSS px, clamped */
export const panBy = (v: View, src: Size, d: number, dx: number, dy: number, zmax = maxZoom(src)) =>
  anchor(v, src, d, { x: 0, y: 0 }, { x: dx, y: dy }, v.zoom, zmax);

/** Past a limit a drag gives way less and less, up to `give`: the edge stops the photo softly */
export function rubber(value: number, min: number, max: number, give: number): number {
  const damp = (over: number) => give * (1 - 1 / (over / give + 1));
  if (value < min) return min - damp(min - value);
  if (value > max) return max + damp(value - max);
  return value;
}

/**
 * A drag from `start` by (dx, dy) CSS px with a soft edge: inside the limits the photo follows the finger, past them it
 * moves at most `give` CSS px more. The result may be out of bounds; on release it settles to `clampView`.
 */
export function dragSoft(start: View, src: Size, d: number, dx: number, dy: number, give = 24): View {
  const s = scaleOf(src, d, start.zoom);
  const r = centreRange(src, start.zoom);
  // in CSS px, where the give is measured
  const x = rubber((start.cx - dx / s) * s, r.x[0] * s, r.x[1] * s, give) / s;
  const y = rubber((start.cy - dy / s) * s, r.y[0] * s, r.y[1] * s, give) / s;
  return { zoom: start.zoom, cx: x, cy: y };
}

/** The square of the photo the circle shows, in source pixels: what the browser draws into the avatar */
export function outputRect(v: View, src: Size): { x: number; y: number; side: number } {
  const c = clampView(v, src, Math.max(v.zoom, 1));
  const side = Math.min(src.w, src.h) / c.zoom;
  return { x: c.cx - side / 2, y: c.cy - side / 2, side };
}

/** The zoom as a slider position (0..1) and back: the slider moves evenly through the zoom's ratios */
export const zoomToSlider = (zoom: number, zmax: number) => (zmax <= 1 ? 0 : Math.log(zoom) / Math.log(zmax));
export const sliderToZoom = (pos: number, zmax: number) => Math.exp(clamp(pos, 0, 1) * Math.log(Math.max(zmax, 1)));
