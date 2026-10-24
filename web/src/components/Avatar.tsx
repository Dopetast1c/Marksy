import { useId } from 'react';
import tokens from '../../../docs/tokens.json';

// A child's avatar (ux-principles D9): an SVG drawn from a few traits, the generator of docs/mockups.html. Until the
// avatar editor (M5d) stores a child's own traits, every child gets the neutral look; what tells two children apart is
// the background, a hue of the subject palette picked by the child's place in the family order, never anything
// guessed from the child's id or name.

export interface AvatarTraits {
  age: 'kid' | 'preteen' | 'teen' | 'adult';
  look: 'boy' | 'girl' | 'neutral';
  skin: string;
  hair: string;
  style: 'buzz' | 'short' | 'medium' | 'long' | 'ponytail' | 'bob' | 'curly' | 'braids';
  eyes: string;
  glasses: boolean;
}

/**
 * The neutral look before the editor exists (owner, M5a): one age for every child, nothing read from the grade or
 * guessed from the name; children are told apart by the background (avatarHue). The grade stays in the signature for
 * the call sites the editor (M5d) replaces.
 */
export function defaultTraits(_grade: number | null): AvatarTraits {
  return {
    age: 'preteen',
    look: 'neutral',
    skin: 'light',
    hair: 'dark',
    style: 'medium',
    eyes: 'brown',
    glasses: false,
  };
}

// hues far apart on the wheel first, so two or three children never share a similar background
const ORDER = ['sky', 'orange', 'green', 'violet', 'pink', 'teal', 'yellow', 'blue', 'red', 'lime', 'purple'] as const;
const HUES = tokens.color.subject as unknown as Record<string, number>;

/** The background hue of the child at this place in the family order */
export const avatarHue = (index: number) => HUES[ORDER[((index % ORDER.length) + ORDER.length) % ORDER.length]!]!;

const v = (group: string, key: string) => `var(--av-${group}-${key})`;

export function Avatar({ traits, index, size = 34 }: { traits: AvatarTraits; index: number; size?: number }) {
  const clip = useId();
  const a = traits;
  const skin = v('skin', a.skin);
  const hair = v('hair', a.hair);
  const eye = v('eyes', a.eyes);
  // proportions: younger = bigger head, lower eyes
  const r = a.age === 'kid' ? 30 : a.age === 'preteen' ? 28 : 26;
  const cy = 54;
  const eyeY = a.age === 'kid' ? 58 : 56;
  const eyeDx = a.age === 'kid' ? 11 : 10;
  const girl = a.look === 'girl';
  let back: React.ReactNode = null;
  let front: React.ReactNode = null;
  const arc = (dr: number) => `a${r + dr},${r + dr} 0 0 1 ${2 * (r + dr)},0`;
  switch (a.style) {
    case 'buzz':
      front = (
        <path
          d={`M${50 - r},${cy} ${arc(0)} l-3,0 a${r - 3},${r - 5} 0 0 0 -${2 * r - 6},0 z`}
          fill={hair}
          opacity={0.85}
        />
      );
      break;
    case 'short':
      front = (
        <path d={`M${50 - r - 1},${cy + 2} ${arc(1)} l-3,0 a${r - 2},${r - 10} 0 0 0 -${2 * r - 4},0 z`} fill={hair} />
      );
      break;
    case 'medium':
      front = (
        <path
          d={`M${50 - r - 2},${cy + 10} v-8 ${arc(2)} v8 l-5,0 v-6 a${r - 3},${r - 3} 0 0 0 -${2 * r - 4},0 v6 z`}
          fill={hair}
        />
      );
      break;
    case 'long':
      back = <path d={`M${50 - r - 3},${cy} ${arc(3)} v34 h-${2 * r + 6} z`} fill={hair} />;
      front = (
        <path d={`M${50 - r - 3},${cy + 4} ${arc(3)} l-6,0 a${r - 3},${r - 3} 0 0 0 -${2 * r - 6},0 z`} fill={hair} />
      );
      break;
    case 'ponytail':
      back = <ellipse cx={50 + r + 2} cy={cy + 14} rx={7} ry={18} fill={hair} />;
      front = (
        <path d={`M${50 - r - 2},${cy + 3} ${arc(2)} l-6,0 a${r - 4},${r - 4} 0 0 0 -${2 * r - 8},0 z`} fill={hair} />
      );
      break;
    case 'bob':
      back = (
        <path d={`M${50 - r - 3},${cy} ${arc(3)} v16 a6,6 0 0 1 -6,6 h-${2 * r - 6} a6,6 0 0 1 -6,-6 z`} fill={hair} />
      );
      front = (
        <path d={`M${50 - r - 3},${cy + 4} ${arc(3)} l-6,0 a${r - 3},${r - 3} 0 0 0 -${2 * r - 6},0 z`} fill={hair} />
      );
      break;
    case 'curly':
      front = [-1, -0.6, -0.2, 0.2, 0.6, 1].map((k) => (
        <circle
          key={k}
          cx={50 + k * (r - 2)}
          cy={cy - Math.sqrt(Math.max(0, (r + 2) ** 2 - (k * (r - 2)) ** 2)) + 4}
          r={9}
          fill={hair}
        />
      ));
      break;
    case 'braids':
      back = (
        <path
          d={`M${50 - r - 6},${cy} q0,30 4,38 h8 q-2,-14 -2,-38z M${50 + r + 6},${cy} q0,30 -4,38 h-8 q2,-14 2,-38z`}
          fill={hair}
        />
      );
      front = (
        <path d={`M${50 - r - 3},${cy + 4} ${arc(3)} l-6,0 a${r - 3},${r - 3} 0 0 0 -${2 * r - 6},0 z`} fill={hair} />
      );
      break;
  }
  const line = v('line', 'mouth');
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className="block shrink-0 rounded-pill"
      style={{ '--avh': avatarHue(index) } as React.CSSProperties}
    >
      <circle cx={50} cy={50} r={50} fill="color-mix(in oklab, hsl(var(--avh) 70% 55%) 28%, var(--surface))" />
      <clipPath id={clip}>
        <circle cx={50} cy={50} r={50} />
      </clipPath>
      <g clipPath={`url(#${clip})`}>
        {back}
        <rect x={42} y={cy + r - 6} width={16} height={14} fill={skin} />
        <path d="M22,100 q28,-34 56,0 z" fill={v('shirt', a.look)} />
        <circle cx={50} cy={cy} r={r} fill={skin} />
        {front}
        <circle cx={50 - eyeDx} cy={eyeY} r={3.2} fill={eye} />
        <circle cx={50 + eyeDx} cy={eyeY} r={3.2} fill={eye} />
        <circle cx={50 - eyeDx + 1} cy={eyeY - 1} r={1} fill={v('line', 'shine')} />
        <circle cx={50 + eyeDx + 1} cy={eyeY - 1} r={1} fill={v('line', 'shine')} />
        <path
          d={girl ? `M44,${cy + 14} q6,5 12,0` : `M45,${cy + 14} q5,4 10,0`}
          fill="none"
          stroke={line}
          strokeWidth={2}
          strokeLinecap="round"
        />
        {a.glasses && (
          <g fill="none" stroke={v('line', 'glasses')} strokeWidth={2}>
            <circle cx={50 - eyeDx} cy={eyeY} r={7} />
            <circle cx={50 + eyeDx} cy={eyeY} r={7} />
            <path d={`M${50 - eyeDx + 7},${eyeY} h${2 * eyeDx - 14}`} />
          </g>
        )}
      </g>
    </svg>
  );
}
