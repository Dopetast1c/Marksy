import { useEffect } from 'react';
import { useMe } from '../api/queries';
import { loadFont } from '../lib/fonts';

// Оформление applied (docs/design.md 5.6a, D46): the person's theme, palette, body font and wallpaper go on <html> as
// data attributes the generated tokens answer to (tokens.css: data-theme, data-palette, data-font) and as the
// wallpaper layer's picture and opacity (base.css: data-wall). Before sign-in, and on the login screen, the defaults:
// light, the sea palette, Manrope, no wallpaper.

export function Appearance() {
  const me = useMe();
  const a = me.data?.user.appearance;
  useEffect(() => {
    const root = document.documentElement;
    const set = (name: string, value: string | null) =>
      value === null ? root.removeAttribute(name) : root.setAttribute(name, value);
    set('data-theme', !a ? 'light' : a.theme === 'system' ? null : a.theme);
    set('data-palette', a && a.palette !== 'sea' ? a.palette : null);
    set('data-font', a && a.font !== 'manrope' ? a.font : null);
    if (a) loadFont(a.font);
    const wall = a?.background === 'wallpaper' ? a.wallpaper : null;
    set('data-wall', wall === null ? null : wall === 'own' ? 'own' : 'pattern');
    if (wall) {
      root.style.setProperty(
        '--wall-image',
        wall === 'own' ? 'url("/api/me/wallpaper")' : `url("/wallpapers/${wall}.svg")`,
      );
      root.style.setProperty('--wall-op', String(a!.opacity / 100));
    } else {
      root.style.removeProperty('--wall-image');
      root.style.removeProperty('--wall-op');
    }
  }, [a]);
  return null;
}
