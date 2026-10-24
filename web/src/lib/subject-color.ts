import type { CSSProperties } from 'react';
import tokens from '../../../docs/tokens.json';

// Subject colours (docs/design.md 6.6, ux-principles D36): wayfinding, never meaning. Until the family picks colours
// (M5d) every subject gets «авто», a stable hue from its name, the prototype's autoHue; the bar is drawn by CSS from
// the variable --sh (and --ss, the saturation, 0 for grey).

/** The prototype's stable hue for a subject name */
export function autoHue(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const GREY: number | null = (tokens.color.subject as Record<string, unknown>).grey as null;

/** The style that colours a subject's bar or stripe: `background: hsl(var(--sh) var(--ss, 62%) 50%)` */
export function subjectStyle(name: string, hue: number | null | undefined = undefined): CSSProperties {
  const h = hue === undefined ? autoHue(name) : hue;
  return (h === GREY || h == null ? { '--sh': 210, '--ss': '0%' } : { '--sh': h }) as unknown as CSSProperties;
}
