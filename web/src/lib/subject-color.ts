import type { CSSProperties } from 'react';
import tokens from '../../../docs/tokens.json';

// Subject colours (docs/design.md 6.6, ux-principles D36): wayfinding, never meaning. The family picks one of the
// twelve palette keys of tokens.json → color.subject per subject, or leaves it on «авто», a stable hue from the subject
// name (the prototype's autoHue); the server sends the key or null. The bar is drawn by CSS from the variable --sh
// (and --ss, the saturation, 0 for grey).

const PALETTE = tokens.color.subject as unknown as Record<string, number | null | string | object>;

/** The twelve keys a family picks from, in the palette's order */
export const SUBJECT_COLORS = Object.entries(PALETTE)
  .filter(([, v]) => typeof v === 'number' || v === null)
  .map(([k]) => k);

/** The prototype's stable hue for a subject name */
export function autoHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** The hue of a palette key (null for grey), or of «авто» when the key is null */
export function subjectHue(name: string, color: string | null | undefined): number | null {
  if (color == null || !(color in PALETTE)) return autoHue(name);
  const v = PALETTE[color];
  return typeof v === 'number' ? v : null;
}

/** The style that colours a subject's bar or stripe: `background: hsl(var(--sh) var(--ss, 62%) 50%)` */
export function subjectStyle(name: string, color: string | null = null): CSSProperties {
  const h = subjectHue(name, color);
  return (h == null ? { '--sh': 210, '--ss': '0%' } : { '--sh': h }) as unknown as CSSProperties;
}
