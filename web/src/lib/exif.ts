// A phone stores a photo as the sensor saw it and writes how to turn it in the EXIF orientation tag (1 to 8). The
// server strips EXIF (docs/design.md 14.1), so the avatar must be upright in its pixels: the crop reads the tag here
// and, where the browser's decoder has not turned the picture already, turns it on a canvas with the matrix below.
// Pure functions, no image library.

export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** A canvas transform [a, b, c, d, e, f] as ctx.setTransform takes it */
export type Matrix = [number, number, number, number, number, number];

/** The orientation tag of a JPEG (1 when there is none or the file is not a JPEG); reads only the first segments */
export function readOrientation(bytes: Uint8Array): Orientation {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 4 || view.getUint16(0) !== 0xffd8) return 1;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return 1;
    const marker = bytes[i + 1]!;
    // start of scan or end: no EXIF came before the image data
    if (marker === 0xda || marker === 0xd9) return 1;
    const len = view.getUint16(i + 2);
    if (len < 2) return 1;
    const start = i + 4;
    if (marker === 0xe1 && start + 14 <= bytes.length && ascii(bytes, start, 6) === 'Exif\0\0') {
      return orientationInTiff(view, start + 6, Math.min(bytes.length, i + 2 + len));
    }
    i += 2 + len;
  }
  return 1;
}

function ascii(b: Uint8Array, from: number, n: number) {
  return String.fromCharCode(...b.subarray(from, from + n));
}

function orientationInTiff(view: DataView, tiff: number, end: number): Orientation {
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return 1;
  const le = order === 0x4949;
  if (view.getUint16(tiff + 2, le) !== 42) return 1;
  const ifd = tiff + view.getUint32(tiff + 4, le);
  if (ifd + 2 > end) return 1;
  const count = view.getUint16(ifd, le);
  for (let k = 0; k < count; k++) {
    const entry = ifd + 2 + k * 12;
    if (entry + 12 > end) return 1;
    if (view.getUint16(entry, le) !== 0x0112) continue;
    const value = view.getUint16(entry + 8, le);
    return value >= 1 && value <= 8 ? (value as Orientation) : 1;
  }
  return 1;
}

/** The same JPEG with an EXIF segment that carries only this orientation, right after its start (the decoder probe) */
export function withOrientation(jpeg: Uint8Array, o: Orientation): Uint8Array {
  // "Exif\0\0", big-endian TIFF header, one IFD with one SHORT entry (0x0112), no next IFD
  const tiff = [0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = payload.length + 2;
  const segment = [0xff, 0xe1, len >> 8, len & 0xff, ...payload];
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2), 0);
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}

/** 5 to 8 turn the picture by a quarter: width and height swap */
export const swapsSides = (o: Orientation) => o >= 5;

/** The size of the upright picture */
export const orientedSize = (w: number, h: number, o: Orientation) => (swapsSides(o) ? { w: h, h: w } : { w, h });

/**
 * The transform that draws the stored picture (w × h, as the sensor saw it) upright into a canvas of orientedSize:
 * ctx.setTransform(...m) and then drawImage(picture, 0, 0)
 */
export function orientationMatrix(o: Orientation, w: number, h: number): Matrix {
  switch (o) {
    case 2:
      return [-1, 0, 0, 1, w, 0];
    case 3:
      return [-1, 0, 0, -1, w, h];
    case 4:
      return [1, 0, 0, -1, 0, h];
    case 5:
      return [0, 1, 1, 0, 0, 0];
    case 6:
      return [0, 1, -1, 0, h, 0];
    case 7:
      return [0, -1, -1, 0, h, w];
    case 8:
      return [0, -1, 1, 0, 0, w];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

/** Where a point of the stored picture lands under a matrix */
export const applyMatrix = ([a, b, c, d, e, f]: Matrix, x: number, y: number) => ({
  x: a * x + c * y + e,
  y: b * x + d * y + f,
});
