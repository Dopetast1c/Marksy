import { describe, expect, it } from 'vitest';
import {
  anchor,
  AVATAR_SHARP_PX,
  clampView,
  coverView,
  dragSoft,
  MAX_ZOOM,
  maxZoom,
  outputRect,
  panBy,
  rubber,
  scaleOf,
  sliderToZoom,
  zoomAt,
  zoomToSlider,
} from './crop';

const wide = { w: 3000, h: 2000 };
const tall = { w: 1200, h: 1600 };
const D = 280;

describe('the crop of a photo avatar', () => {
  it('starts centred, zoomed just to cover the circle', () => {
    expect(coverView(wide)).toEqual({ zoom: 1, cx: 1500, cy: 1000 });
    // the shorter side spans the circle
    expect(scaleOf(wide, D, 1) * 2000).toBeCloseTo(D);
    expect(outputRect(coverView(tall), tall)).toEqual({ x: 0, y: 200, side: 1200 });
  });

  it('zooms up to 4×, less when the photo has too few pixels for a sharp avatar, never below cover', () => {
    expect(maxZoom(wide)).toBe(MAX_ZOOM);
    expect(maxZoom({ w: 800, h: 600 })).toBeCloseTo(600 / AVATAR_SHARP_PX);
    expect(maxZoom({ w: 200, h: 200 })).toBe(1);
    expect(clampView({ zoom: 9, cx: 1500, cy: 1000 }, wide).zoom).toBe(4);
    expect(clampView({ zoom: 0.5, cx: 1500, cy: 1000 }, wide).zoom).toBe(1);
  });

  it('never lets an edge of the photo inside the circle', () => {
    // at zoom 1 the wide photo can only move sideways
    expect(clampView({ zoom: 1, cx: -50, cy: 5000 }, wide)).toEqual({ zoom: 1, cx: 1000, cy: 1000 });
    expect(clampView({ zoom: 2, cx: 9999, cy: 0 }, wide)).toEqual({ zoom: 2, cx: 2500, cy: 500 });
    const far = panBy(coverView(wide), wide, D, 10_000, 10_000);
    expect(outputRect(far, wide)).toEqual({ x: 0, y: 0, side: 2000 });
  });

  it('drags with the finger: the photo moves the way it is pulled', () => {
    const v = panBy({ zoom: 2, cx: 1500, cy: 1000 }, wide, D, 14, -7);
    const s = scaleOf(wide, D, 2);
    expect(v.cx).toBeCloseTo(1500 - 14 / s);
    expect(v.cy).toBeCloseTo(1000 + 7 / s);
  });

  it('zooms around the point under the cursor or the fingers', () => {
    const v = { zoom: 1.5, cx: 1400, cy: 1000 };
    const at = { x: 60, y: -40 };
    const before = { x: v.cx + at.x / scaleOf(wide, D, v.zoom), y: v.cy + at.y / scaleOf(wide, D, v.zoom) };
    const z = zoomAt(v, wide, D, 3, at);
    const after = { x: z.cx + at.x / scaleOf(wide, D, z.zoom), y: z.cy + at.y / scaleOf(wide, D, z.zoom) };
    expect(z.zoom).toBe(3);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    // a pinch: the point under the first midpoint follows the fingers to the second
    const p = anchor(v, wide, D, { x: 0, y: 0 }, { x: 20, y: 10 }, 2);
    expect(p.cx + 20 / scaleOf(wide, D, 2)).toBeCloseTo(1400);
    expect(p.cy + 10 / scaleOf(wide, D, 2)).toBeCloseTo(1000);
  });

  it('stops softly at the edge and settles inside on release', () => {
    expect(rubber(5, 0, 10, 24)).toBe(5);
    expect(rubber(-1000, 0, 10, 24)).toBeGreaterThan(-24);
    expect(rubber(-10, 0, 10, 24)).toBeLessThan(0);
    expect(rubber(30, 0, 10, 24)).toBeLessThan(30);
    const start = coverView(wide);
    // pulled far to the right: the photo's left edge would come into the circle
    const pulled = dragSoft(start, wide, D, 5000, 0);
    const s = scaleOf(wide, D, 1);
    expect((1000 - pulled.cx) * s).toBeGreaterThan(0);
    expect((1000 - pulled.cx) * s).toBeLessThan(24);
    expect(clampView(pulled, wide).cx).toBe(1000);
  });

  it('gives the square to draw in source pixels', () => {
    expect(outputRect({ zoom: 4, cx: 2000, cy: 600 }, wide)).toEqual({ x: 1750, y: 350, side: 500 });
    // a view out of bounds is drawn as it settles
    expect(outputRect({ zoom: 2, cx: 0, cy: 0 }, wide)).toEqual({ x: 0, y: 0, side: 1000 });
  });

  it('maps the slider evenly through the zoom ratios', () => {
    expect(zoomToSlider(1, 4)).toBe(0);
    expect(zoomToSlider(2, 4)).toBeCloseTo(0.5);
    expect(sliderToZoom(1, 4)).toBeCloseTo(4);
    expect(sliderToZoom(0.5, 4)).toBeCloseTo(2);
    expect(zoomToSlider(1, 1)).toBe(0);
    expect(sliderToZoom(1, 1)).toBe(1);
  });
});
