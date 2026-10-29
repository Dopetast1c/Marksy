import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

// The uploaded pictures in a backup (docs/running.md): a plain ustar archive, gzipped, written and read here instead
// of by a tar program, so a backup works the same in the container and on a Windows development computer. Only
// regular files under the folder go in; on the way out, a name that would leave the folder is refused.

const BLOCK = 512;

function header(name: string, size: number): Buffer {
  const h = Buffer.alloc(BLOCK);
  if (Buffer.byteLength(name) > 100) throw new Error('a picture path is too long for the archive');
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100); // mode
  h.write('0000000\0', 108); // uid
  h.write('0000000\0', 116); // gid
  h.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  h.write('00000000000\0', 136); // mtime: 0, the archive's checksum stays the same for the same files
  h.write('        ', 148); // checksum placeholder
  h.write('0', 156); // a regular file
  h.write('ustar\0', 257);
  h.write('00', 263);
  let sum = 0;
  for (const b of h) sum += b;
  h.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return h;
}

async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
    .sort();
}

/** Packs every regular file under dir into a gzipped tar; returns how many */
export async function packDir(dir: string, file: string): Promise<number> {
  const names = await filesUnder(dir);
  const parts: Buffer[] = [];
  for (const name of names) {
    const body = await readFile(join(dir, name));
    parts.push(header(name, body.length), body, Buffer.alloc((BLOCK - (body.length % BLOCK)) % BLOCK));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  await writeFile(file, gzipSync(Buffer.concat(parts)));
  return names.length;
}

/** Unpacks a gzipped tar of packDir into dir; returns how many files */
export async function unpackTo(file: string, dir: string): Promise<number> {
  const data = gunzipSync(await readFile(file));
  const root = resolve(dir);
  let at = 0;
  let count = 0;
  while (at + BLOCK <= data.length) {
    const h = data.subarray(at, at + BLOCK);
    if (h.every((b) => b === 0)) break;
    const name = h.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(h.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim(), 8);
    const type = String.fromCharCode(h[156] ?? 48);
    at += BLOCK;
    if (type === '0' || type === '\0') {
      const target = resolve(root, name);
      if (!target.startsWith(root + sep)) throw new Error('the archive names a file outside its folder');
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, data.subarray(at, at + size));
      count++;
    }
    at += Math.ceil(size / BLOCK) * BLOCK;
  }
  return count;
}
