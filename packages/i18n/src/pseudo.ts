import type { Messages } from './translate';

// The pseudo-locale qps (docs/i18n.md 5): every English string accented, lengthened by 30 percent and wrapped in
// brackets, so overflow and a string that bypasses t() show at a glance. Development only; it is not one of the
// twelve languages and never reaches a user.

export const PSEUDO_LOCALE = 'qps';

// prettier-ignore
const ACCENTED: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'í', j: 'ĵ', k: 'ķ', l: 'ĺ', m: 'ɱ',
  n: 'ñ', o: 'ó', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'ú', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Á', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Í', J: 'Ĵ', K: 'Ķ', L: 'Ĺ', M: 'Ṁ',
  N: 'Ñ', O: 'Ó', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Ú', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

const PLACEHOLDER = /(\{\{\s*\w+\s*\}\})/;

const MAX_CHARS = /max (\d+) chars/;

/**
 * One string: placeholders kept as they are, letters accented, 30 percent longer, in brackets. The padding comes in
 * words of five, so a long text still wraps. A string with a length limit (docs/i18n.md 4) is filled to exactly its
 * limit instead, with a letter of average width: the layout promises room for that many characters, not more.
 */
export function pseudoString(s: string, max?: number): string {
  const parts = s.split(PLACEHOLDER);
  const text = parts.map((p, i) => (i % 2 ? p : [...p].map((c) => ACCENTED[c] ?? c).join(''))).join('');
  if (max !== undefined) {
    const length = [...text].length;
    return length + 2 <= max
      ? `[${text}${'e'.repeat(max - length - 2)}]`
      : text + 'e'.repeat(Math.max(0, max - length));
  }
  const n = Math.ceil(parts.filter((_, i) => i % 2 === 0).join('').length * 0.3);
  const words = Array.from({ length: Math.ceil(n / 5) }, (_, i) => '~'.repeat(Math.min(5, n - i * 5)));
  return `[${text}${n <= 5 ? words.join('') : ` ${words.join(' ')}`}]`;
}

/** The pseudo catalog built from the English one (comments left out, limits kept) */
export function pseudoCatalog(source: Messages): Messages {
  const limit = (key: string) => {
    const m = source[`${key}_comment`]?.match(MAX_CHARS);
    return m ? Number(m[1]) : undefined;
  };
  return Object.fromEntries(
    Object.entries(source)
      .filter(([k]) => !k.endsWith('_comment'))
      .map(([k, v]) => [k, pseudoString(v, limit(k))]),
  );
}
