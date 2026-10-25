import { describe, expect, it } from 'vitest';
import { jpegWithGps } from '../../test/images';
import { checkImage, sniff } from './image';

// Synthetic pictures, byte by byte: just enough structure for the parser, nothing a decoder would need to render.

const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
};
function pngWithText(w = 100, h = 80) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('Author\0Someone', 'latin1')),
    chunk('eXIf', Buffer.from('MM\0*GPS', 'latin1')),
    chunk('IDAT', Buffer.from([1, 2, 3])),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const riffChunk = (fourcc: string, data: Buffer) => {
  const head = Buffer.alloc(8);
  head.write(fourcc, 0, 'latin1');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};
function webpWithExif(w = 300, h = 200) {
  const vp8x = Buffer.alloc(10);
  vp8x[0] = 0x08 | 0x04; // EXIF and XMP present
  vp8x.writeUIntLE(w - 1, 4, 3);
  vp8x.writeUIntLE(h - 1, 7, 3);
  const vp8 = Buffer.alloc(10);
  vp8.writeUInt16LE(w, 6);
  vp8.writeUInt16LE(h, 8);
  const body = Buffer.concat([
    riffChunk('VP8X', vp8x),
    riffChunk('VP8 ', vp8),
    riffChunk('EXIF', Buffer.from('MM\0*GPS position', 'latin1')),
    riffChunk('XMP ', Buffer.from('<x:xmpmeta/>', 'latin1')),
  ]);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(4 + body.length, 4);
  head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}

const LIMITS = { maxBytes: 1_000_000, maxSide: 512 };

describe('checkImage', () => {
  it('a JPEG keeps its picture and loses EXIF (with the GPS position), XMP and the comment', () => {
    const before = jpegWithGps();
    const out = checkImage(before, LIMITS);
    expect(out).toMatchObject({ type: 'jpeg', mime: 'image/jpeg', width: 512, height: 512 });
    const text = out.bytes.toString('latin1');
    for (const gone of ['Exif', 'GPS', 'xmpmeta', 'taken at home']) expect(text).not.toContain(gone);
    expect(text).toContain('JFIF');
    // the frame and the scan are byte for byte the same
    expect(out.bytes.subarray(-9).equals(before.subarray(-9))).toBe(true);
    expect(sniff(out.bytes)).toBe('jpeg');
  });

  it('a PNG loses its text and EXIF chunks; a WebP its EXIF and XMP, with the header saying so', () => {
    const p = checkImage(pngWithText(), LIMITS);
    expect(p).toMatchObject({ type: 'png', width: 100, height: 80 });
    expect(p.bytes.toString('latin1')).not.toMatch(/tEXt|eXIf|Someone|GPS/);
    expect(p.bytes.toString('latin1')).toContain('IDAT');
    const w = checkImage(webpWithExif(), LIMITS);
    expect(w).toMatchObject({ type: 'webp', width: 300, height: 200 });
    expect(w.bytes.toString('latin1')).not.toMatch(/EXIF|XMP|GPS/);
    expect(w.bytes.readUInt32LE(4)).toBe(w.bytes.length - 8);
    expect(w.bytes[20]! & 0x0c).toBe(0);
  });

  it('trusts nothing it is told: the type from the bytes, the size from the header', () => {
    expect(() => checkImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), LIMITS)).toThrow(/JPEG, PNG/);
    expect(() => checkImage(Buffer.from('GIF89a........'), LIMITS)).toThrow(/JPEG, PNG/);
    expect(() => checkImage(jpegWithGps(1024, 512), LIMITS)).toThrow(/512 pixels/);
    expect(() => checkImage(jpegWithGps(), { ...LIMITS, maxBytes: 20 })).toThrow(/larger than allowed/);
    // a file cut off in the middle of a segment
    expect(() => checkImage(jpegWithGps().subarray(0, 30), LIMITS)).toThrow();
    expect(() => checkImage(Buffer.alloc(0), LIMITS)).toThrow(/No picture/);
  });
});
