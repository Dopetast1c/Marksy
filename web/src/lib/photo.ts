import type { Size } from './crop';
import { AVATAR_OUTPUT_PX } from './crop';
import { orientationMatrix, orientedSize, readOrientation, withOrientation } from './exif';
import type { Orientation } from './exif';

// The browser side of a photo avatar (docs/design.md 5.6, 14.1): decode the picked file, make it upright and no larger
// than the crop needs, then draw the chosen square into the avatar and encode it. Only the drawn square leaves the
// browser; the picked file is never uploaded or kept.

/** The crop never needs more: 4× zoom on the sharp size is far below it, and a phone canvas stays small */
const SOURCE_SHORT_MAX = 2048;

export interface Source extends Size {
  image: CanvasImageSource;
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error('canvas'))), type, quality));

let applies: Promise<boolean> | null = null;

/**
 * Whether this browser's decoder turns a JPEG by its orientation tag already (all current ones do): a 2 × 1 JPEG
 * tagged "turn a quarter" decodes as 1 × 2 if it does. Asked once.
 */
function decoderApplies(): Promise<boolean> {
  applies ??= (async () => {
    try {
      const c = document.createElement('canvas');
      c.width = 2;
      c.height = 1;
      const plain = new Uint8Array(await (await toBlob(c, 'image/jpeg')).arrayBuffer());
      const probe = await createImageBitmap(new Blob([withOrientation(plain, 6) as BlobPart], { type: 'image/jpeg' }));
      const turned = probe.width === 1 && probe.height === 2;
      probe.close();
      return turned;
    } catch {
      return true;
    }
  })();
  return applies;
}

async function orientationOf(file: Blob): Promise<Orientation> {
  try {
    return readOrientation(new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer()));
  } catch {
    return 1;
  }
}

/** The picked file as an upright picture with its shorter side at most SOURCE_SHORT_MAX; throws when it cannot be read */
export async function loadPhoto(file: Blob): Promise<Source> {
  const bitmap = await createImageBitmap(file);
  const tagged = await orientationOf(file);
  const o: Orientation = tagged !== 1 && !(await decoderApplies()) ? tagged : 1;
  const upright = orientedSize(bitmap.width, bitmap.height, o);
  const k = Math.min(1, SOURCE_SHORT_MAX / Math.min(upright.w, upright.h));
  if (o === 1 && k === 1) return { image: bitmap, ...upright };
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(upright.w * k);
  canvas.height = Math.round(upright.h * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  const [a, b, c, d, e, f] = orientationMatrix(o, bitmap.width, bitmap.height);
  ctx.setTransform(a * k, b * k, c * k, d * k, e * k, f * k);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { image: canvas, w: canvas.width, h: canvas.height };
}

/** The square of the source as the avatar: a JPEG of AVATAR_OUTPUT_PX on a side, the format uploads already use */
export async function squareAvatar(
  src: Source,
  rect: { x: number; y: number; side: number },
  side = AVATAR_OUTPUT_PX,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src.image, rect.x, rect.y, rect.side, rect.side, 0, 0, side, side);
  return toBlob(canvas, 'image/jpeg', 0.88);
}
