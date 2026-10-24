// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOKENS_CSS, TOKENS_JSON } from './tokens-to-css';
import { colorVars, subjectHues, tokensToCss } from './tokens';

const tokens = JSON.parse(readFileSync(TOKENS_JSON, 'utf8'));

describe('tokens pipeline', () => {
  it('web/src/styles/tokens.css is generated from the current docs/tokens.json', () => {
    expect(readFileSync(TOKENS_CSS, 'utf8')).toBe(tokensToCss(tokens));
  });

  it('every colour of the light theme exists in the dark one, under the prototype names', () => {
    const light = colorVars(tokens.color.light).map(([k]) => k);
    expect(colorVars(tokens.color.dark).map(([k]) => k)).toEqual(light);
    expect(light).toEqual(expect.arrayContaining(['bg', 'accent-ink', 'band-critical-fg', 'band-top-fg-text']));
  });

  it('Tailwind gets only the tokens: no default colours, fonts, radii or shadows', () => {
    const css = tokensToCss(tokens);
    for (const reset of ['--color-*: initial;', '--font-*: initial;', '--radius-*: initial;', '--shadow-*: initial;'])
      expect(css).toContain(reset);
    expect(css).toContain('--color-band-good-fg: var(--band-good-fg);');
    expect(css).toContain(`--spacing: ${tokens.space['1']};`);
  });

  it('the space scale is a multiple of its first step, as Tailwind computes it', () => {
    const unit = parseFloat(tokens.space['1']);
    for (const [k, v] of Object.entries<string>(tokens.space)) expect(parseFloat(v)).toBe(unit * Number(k));
  });

  it('twelve subject hues, grey without one', () => {
    const hues = subjectHues(tokens);
    expect(Object.keys(hues)).toHaveLength(12);
    expect(hues.grey).toBeNull();
  });
});
