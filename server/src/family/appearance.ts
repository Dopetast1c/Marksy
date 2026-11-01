import { z } from 'zod';
import { registry } from '../openapi';

// Appearance (look.title; docs/design.md 5.6a, D46): personal, stored per user (users.settings.appearance) and applied on every
// device the person signs in on. A palette changes only the page background and the accent; band, severity and subject
// colours never follow it. The ids are those of docs/tokens.json (palette, wallpaper.ids, font.bodyOptions); a test
// keeps the two in step.

export const PALETTES = ['sea', 'forest', 'sky', 'plum', 'berry', 'amber', 'mint', 'graphite'] as const;
export const WALLPAPERS = ['cell', 'line', 'dots', 'doodle', 'waves'] as const;
export const FONTS = ['manrope', 'nunito', 'ptsans', 'inter', 'rubik'] as const;

export const appearanceOut = registry.register(
  'Appearance',
  z.object({
    theme: z.enum(['light', 'dark', 'system']),
    /** color: the palette's background; wallpaper: a built-in pattern or the person's own picture */
    background: z.enum(['color', 'wallpaper']),
    palette: z.enum(PALETTES),
    /** own: the person's uploaded picture (GET /api/me/wallpaper) */
    wallpaper: z.enum([...WALLPAPERS, 'own']),
    /** how much the wallpaper shows, 10 to 100 (%) */
    opacity: z.number().int().min(10).max(100),
    font: z.enum(FONTS),
    /** the person has uploaded a picture of their own */
    hasOwnWallpaper: z.boolean(),
    /** changes with every new picture: GET /api/me/wallpaper?v=… shows the new one at once, never a cached old one */
    wallpaperVersion: z.string().nullable(),
  }),
);
export type Appearance = z.infer<typeof appearanceOut>;

/** What PATCH /api/me/settings accepts: any part of it */
export const appearanceIn = appearanceOut.omit({ hasOwnWallpaper: true, wallpaperVersion: true }).partial();

/** A new user and the login screen: light, the sea palette, Manrope, wallpaper at 35 % (tokens: wallpaper.defaultOpacity) */
export const DEFAULT_APPEARANCE: Omit<Appearance, 'hasOwnWallpaper' | 'wallpaperVersion'> = {
  theme: 'light',
  background: 'color',
  palette: 'sea',
  wallpaper: 'cell',
  opacity: 35,
  font: 'manrope',
};

/** The stored settings as the app gets them: unknown or old values fall back to the defaults, one by one */
export function appearanceOf(settings: Record<string, unknown>, ownWallpaperId: string | null): Appearance {
  const hasOwnWallpaper = !!ownWallpaperId;
  const stored = (settings.appearance ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = { ...DEFAULT_APPEARANCE };
  const shape = appearanceIn.shape;
  for (const key of Object.keys(shape) as (keyof typeof shape)[]) {
    const parsed = shape[key].safeParse(stored[key]);
    if (parsed.success && parsed.data !== undefined) out[key] = parsed.data;
  }
  // an own picture that is gone shows the first pattern
  if (out.wallpaper === 'own' && !hasOwnWallpaper) out.wallpaper = DEFAULT_APPEARANCE.wallpaper;
  return {
    ...(out as Omit<Appearance, 'hasOwnWallpaper' | 'wallpaperVersion'>),
    hasOwnWallpaper,
    wallpaperVersion: ownWallpaperId?.slice(0, 8) ?? null,
  };
}
