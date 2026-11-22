import { describe, expect, it } from 'vitest';
import { applyMatrix, orientationMatrix, orientedSize, readOrientation, withOrientation } from './exif';
import type { Orientation } from './exif';

// SOI, a JFIF APP0, a quantisation table stub, SOS, a byte of data, EOI: enough of a JPEG for the segment walk
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
  0x00, 0xff, 0xdb, 0x00, 0x03, 0x00, 0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9,
]);

/** An EXIF segment in Intel byte order with two entries, the orientation second */
function littleEndianExif(o: number) {
  const tiff = [
    // Intel byte order, 42, the first IFD at 8; two entries
    ...[0x49, 0x49, 42, 0, 8, 0, 0, 0, 2, 0],
    // 0x010F Make, ASCII, 0 bytes
    ...[0x0f, 0x01, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    // 0x0112 Orientation, SHORT, 1
    ...[0x12, 0x01, 3, 0, 1, 0, 0, 0, o, 0, 0, 0],
    // no next IFD
    ...[0, 0, 0, 0],
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...payload, ...JPEG.subarray(2)]);
}

const ALL: Orientation[] = [1, 2, 3, 4, 5, 6, 7, 8];

describe('EXIF orientation', () => {
  it('reads the tag in either byte order, 1 when there is none or the file is not a JPEG', () => {
    expect(readOrientation(JPEG)).toBe(1);
    for (const o of ALL) expect(readOrientation(withOrientation(JPEG, o))).toBe(o);
    expect(readOrientation(littleEndianExif(6))).toBe(6);
    expect(readOrientation(littleEndianExif(0))).toBe(1);
    expect(readOrientation(littleEndianExif(9))).toBe(1);
    expect(readOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe(1);
    expect(readOrientation(new Uint8Array([]))).toBe(1);
    // cut short inside the EXIF segment
    expect(readOrientation(withOrientation(JPEG, 6).subarray(0, 20))).toBe(1);
  });

  it('a quarter turn swaps the sides', () => {
    expect(orientedSize(4000, 3000, 1)).toEqual({ w: 4000, h: 3000 });
    expect(orientedSize(4000, 3000, 3)).toEqual({ w: 4000, h: 3000 });
    expect(orientedSize(4000, 3000, 6)).toEqual({ w: 3000, h: 4000 });
    expect(orientedSize(4000, 3000, 8)).toEqual({ w: 3000, h: 4000 });
  });

  it('draws the stored picture upright: each corner lands where the tag says, inside the upright canvas', () => {
    const w = 40;
    const h = 30;
    // where the stored top-left pixel belongs in the upright picture
    const topLeft: Record<Orientation, 'tl' | 'tr' | 'br' | 'bl'> = {
      1: 'tl',
      2: 'tr',
      3: 'br',
      4: 'bl',
      5: 'tl',
      6: 'tr',
      7: 'br',
      8: 'bl',
    };
    for (const o of ALL) {
      const m = orientationMatrix(o, w, h);
      const up = orientedSize(w, h, o);
      const corner = { tl: { x: 0, y: 0 }, tr: { x: up.w, y: 0 }, br: { x: up.w, y: up.h }, bl: { x: 0, y: up.h } };
      expect(applyMatrix(m, 0, 0), `orientation ${o}`).toEqual(corner[topLeft[o]]);
      for (const [x, y] of [
        [w, 0],
        [w, h],
        [0, h],
      ] as const) {
        const p = applyMatrix(m, x, y);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(up.w);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(up.h);
      }
    }
    // 6 is the usual phone portrait: the stored top row becomes the right column, read top to bottom
    expect(applyMatrix(orientationMatrix(6, w, h), w, 0)).toEqual({ x: h, y: w });
  });
});
