import { HttpError } from '../http/errors';

// Pictures people upload (docs/design.md 14.1): the browser scales them first, but nothing it sends is trusted. The
// type comes from the signature bytes, never from the name or the declared type; the pixel size from the image's own
// header; and every piece of metadata (EXIF with GPS, XMP, IPTC, comments, PNG text, WebP EXIF and XMP) is cut out
// here by walking the file's segments or chunks, with no image library. What comes out is the same picture without
// anything that could say where or when it was taken or by what.

export type ImageType = 'jpeg' | 'png' | 'webp';

export const MIME: Record<ImageType, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const EXT: Record<ImageType, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** What the bytes are, from their signature only */
export function sniff(b: Buffer): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

const bad = (why: string) => new HttpError(400, 'bad_image', why);

// ---------------------------------------------------------------------------------------------------------------
// JPEG: SOI, then segments FF xx [length]; each SOS is followed by entropy-coded data up to the next marker (a
// progressive file has several scans with tables between them); EOI ends the picture and nothing after it is kept

/** APPn segments that carry no metadata and that decoders may need: JFIF (APP0), an ICC profile (APP2), Adobe (APP14) */
function keepJpegApp(marker: number, data: Buffer): boolean {
  if (marker === 0xe0) return true;
  if (marker === 0xe2) return data.toString('latin1', 0, 12) === 'ICC_PROFILE\0';
  if (marker === 0xee) return data.toString('latin1', 0, 5) === 'Adobe';
  return false;
}

function jpeg(b: Buffer): { width: number; height: number; clean: Buffer } {
  const out: Buffer[] = [b.subarray(0, 2)];
  let i = 2;
  let size: { width: number; height: number } | null = null;
  let ended = false;
  while (i < b.length) {
    if (b[i] !== 0xff) throw bad('A JPEG segment does not start where it should');
    // fill bytes before a marker
    while (b[i] === 0xff && b[i + 1] === 0xff) i++;
    const marker = b[i + 1];
    if (marker === undefined) throw bad('The JPEG ends inside a marker');
    if (marker === 0xd9) {
      out.push(b.subarray(i, i + 2));
      ended = true;
      break;
    }
    // markers without a length
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      out.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > b.length) throw bad('The JPEG ends inside a segment');
    const len = b.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > b.length) throw bad('A JPEG segment is longer than the file');
    const data = b.subarray(i + 4, i + 2 + len);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (size) throw bad('The JPEG has a second frame header');
      if (data.length < 5) throw bad('The JPEG frame header is too short');
      size = { height: data.readUInt16BE(1), width: data.readUInt16BE(3) };
    }
    const metadata = (marker >= 0xe0 && marker <= 0xef && !keepJpegApp(marker, data)) || marker === 0xfe;
    if (!metadata) out.push(b.subarray(i, i + 2 + len));
    i += 2 + len;
    // start of scan: the entropy-coded data runs to the next marker that is neither a stuffed byte (FF 00), a restart
    // (FF D0-D7) nor fill; then segments again, still without metadata
    if (marker === 0xda) {
      const start = i;
      while (i < b.length) {
        if (b[i] !== 0xff) {
          i++;
          continue;
        }
        const m = b[i + 1];
        if (m === 0x00 || (m !== undefined && m >= 0xd0 && m <= 0xd7)) i += 2;
        else if (m === 0xff) i++;
        else break;
      }
      out.push(b.subarray(start, i));
      if (i >= b.length) throw bad('The JPEG ends inside its image data');
    }
  }
  if (!size) throw bad('The JPEG has no frame header');
  if (!ended) throw bad('The JPEG has no end');
  return { ...size, clean: Buffer.concat(out) };
}

// ---------------------------------------------------------------------------------------------------------------
// PNG: signature, then chunks [length][type][data][crc]; IHDR first. Only the chunks a picture needs are kept (an
// allow-list: text, EXIF, time and any private or unknown chunk go), and nothing after IEND

const PNG_KEEP = new Set([
  'IHDR',
  'PLTE',
  'IDAT',
  'IEND',
  'tRNS',
  'cHRM',
  'gAMA',
  'iCCP',
  'sBIT',
  'sRGB',
  'bKGD',
  'pHYs',
  // an animated PNG
  'acTL',
  'fcTL',
  'fdAT',
]);

function png(b: Buffer): { width: number; height: number; clean: Buffer } {
  const out: Buffer[] = [PNG_SIGNATURE];
  let i = 8;
  let size: { width: number; height: number } | null = null;
  let ended = false;
  while (i < b.length) {
    if (i + 12 > b.length) throw bad('The PNG ends inside a chunk');
    const len = b.readUInt32BE(i);
    const type = b.toString('latin1', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > b.length) throw bad('A PNG chunk is longer than the file');
    if ((i === 8) !== (type === 'IHDR')) throw bad('The PNG header chunk is not the first and only one');
    if (type === 'IHDR') size = { width: b.readUInt32BE(i + 8), height: b.readUInt32BE(i + 12) };
    if (PNG_KEEP.has(type)) out.push(b.subarray(i, end));
    i = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!size) throw bad('The PNG has no header chunk');
  if (!ended) throw bad('The PNG has no end');
  return { ...size, clean: Buffer.concat(out) };
}

// ---------------------------------------------------------------------------------------------------------------
// WebP: RIFF, size, WEBP, then chunks [fourcc][size LE][data, padded to even] up to the RIFF size. Only the chunks a
// picture needs are kept (an allow-list: EXIF, XMP and any other chunk go)

const WEBP_KEEP = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ANIM', 'ANMF', 'ICCP']);

function webp(b: Buffer): { width: number; height: number; clean: Buffer } {
  const chunks: Buffer[] = [];
  let i = 12;
  let size: { width: number; height: number } | null = null;
  let vp8x: Buffer | null = null;
  // what follows the RIFF container is not the picture's
  const riffEnd = 8 + b.readUInt32LE(4);
  if (riffEnd > b.length) throw bad('The WebP is shorter than it says');
  while (i + 8 <= riffEnd) {
    const fourcc = b.toString('latin1', i, i + 4);
    const len = b.readUInt32LE(i + 4);
    const end = i + 8 + len + (len % 2);
    if (i + 8 + len > riffEnd) throw bad('A WebP chunk is longer than the file');
    const data = b.subarray(i + 8, i + 8 + len);
    if (fourcc === 'VP8X' && len >= 10) {
      size = { width: data.readUIntLE(4, 3) + 1, height: data.readUIntLE(7, 3) + 1 };
    } else if (fourcc === 'VP8 ' && !size && len >= 10) {
      size = { width: data.readUInt16LE(6) & 0x3fff, height: data.readUInt16LE(8) & 0x3fff };
    } else if (fourcc === 'VP8L' && !size && len >= 5) {
      const bits = data.readUInt32LE(1);
      size = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (WEBP_KEEP.has(fourcc)) {
      const chunk = Buffer.from(b.subarray(i, Math.min(end, riffEnd)));
      if (fourcc === 'VP8X') vp8x = chunk;
      chunks.push(chunk);
    }
    i = end;
  }
  if (!size) throw bad('The WebP has no image chunk');
  // the extended header says no EXIF or XMP follow any more (flag bits 3 and 2)
  if (vp8x) vp8x[8] = vp8x[8]! & ~0x0c;
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return { ...size, clean: Buffer.concat([header, body]) };
}

export interface CheckedImage {
  type: ImageType;
  mime: string;
  width: number;
  height: number;
  /** the picture without its metadata */
  bytes: Buffer;
}

/** The upload as a picture this server keeps, or 400: a known type, within the size limits, metadata removed */
export function checkImage(upload: Buffer, limits: { maxBytes: number; maxSide: number }): CheckedImage {
  if (!upload.length) throw bad('No picture was sent');
  if (upload.length > limits.maxBytes) throw new HttpError(413, 'too_large', 'The picture is larger than allowed');
  const type = sniff(upload);
  if (!type) throw bad('Only JPEG, PNG and WebP pictures are accepted');
  const { width, height, clean } = type === 'jpeg' ? jpeg(upload) : type === 'png' ? png(upload) : webp(upload);
  if (!width || !height) throw bad('The picture has no size');
  if (width > limits.maxSide || height > limits.maxSide)
    throw bad(`The picture is larger than ${limits.maxSide} pixels on a side`);
  return { type, mime: MIME[type], width, height, bytes: clean };
}
