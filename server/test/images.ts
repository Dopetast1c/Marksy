// Synthetic pictures for the upload tests, byte by byte: just enough structure for the parser (src/uploads/image.ts),
// nothing a decoder would need to render. Nothing here is a real photo.

const seg = (marker: number, data: Buffer) => {
  const head = Buffer.alloc(4);
  head[0] = 0xff;
  head[1] = marker;
  head.writeUInt16BE(data.length + 2, 2);
  return Buffer.concat([head, data]);
};

/** A JPEG with JFIF, EXIF holding a GPS position, XMP, a comment, a frame of w × h and a scan */
export function jpegWithGps(w = 512, h = 512) {
  const sof = Buffer.alloc(6);
  sof[0] = 8;
  sof.writeUInt16BE(h, 1);
  sof.writeUInt16BE(w, 3);
  sof[5] = 1;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    seg(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    seg(0xe1, Buffer.from('Exif\0\0MM\0*GPSLatitude 53.9 GPSLongitude 27.56', 'latin1')),
    seg(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>CreatorTool</x:xmpmeta>', 'latin1')),
    seg(0xfe, Buffer.from('taken at home', 'latin1')),
    seg(0xc0, sof),
    seg(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0])),
    Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]),
    Buffer.from([0xff, 0xd9]),
  ]);
}
