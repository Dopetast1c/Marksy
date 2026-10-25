import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appearanceOf, DEFAULT_APPEARANCE, FONTS, PALETTES, WALLPAPERS } from './appearance';

describe('appearance', () => {
  it('the ids are those of docs/tokens.json', () => {
    const tokens = JSON.parse(readFileSync(new URL('../../../docs/tokens.json', import.meta.url), 'utf8'));
    expect([...PALETTES]).toEqual(Object.keys(tokens.palette).filter((k) => !k.startsWith('$')));
    expect([...WALLPAPERS]).toEqual(tokens.wallpaper.ids);
    expect([...FONTS]).toEqual(Object.keys(tokens.font.bodyOptions).filter((k) => !k.startsWith('$')));
    expect(DEFAULT_APPEARANCE.opacity / 100).toBe(tokens.wallpaper.defaultOpacity);
  });

  it('unknown or old values fall back one by one; an own picture that is gone shows the first pattern', () => {
    const a = appearanceOf({ appearance: { theme: 'dark', palette: 'neon', opacity: 500, wallpaper: 'own' } }, false);
    expect(a).toEqual({ ...DEFAULT_APPEARANCE, theme: 'dark', hasOwnWallpaper: false });
    expect(appearanceOf({ appearance: { wallpaper: 'own' } }, true).wallpaper).toBe('own');
  });
});
