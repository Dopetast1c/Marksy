// The body fonts of Appearance (look.title; docs/design.md 5.6a): all served from the app's own origin (@fontsource,
// 14.1), and only the chosen one is loaded; Manrope, the default, comes with the app's stylesheet.

const LOADERS: Record<string, () => Promise<unknown>> = {
  nunito: () =>
    Promise.all([
      import('@fontsource/nunito/400.css'),
      import('@fontsource/nunito/600.css'),
      import('@fontsource/nunito/700.css'),
      import('@fontsource/nunito/800.css'),
    ]),
  ptsans: () => Promise.all([import('@fontsource/pt-sans/400.css'), import('@fontsource/pt-sans/700.css')]),
  inter: () =>
    Promise.all([
      import('@fontsource/inter/400.css'),
      import('@fontsource/inter/600.css'),
      import('@fontsource/inter/700.css'),
      import('@fontsource/inter/800.css'),
    ]),
  rubik: () =>
    Promise.all([
      import('@fontsource/rubik/400.css'),
      import('@fontsource/rubik/500.css'),
      import('@fontsource/rubik/700.css'),
      import('@fontsource/rubik/800.css'),
    ]),
};

const loaded = new Set<string>(['manrope']);

/** A body font's stack (tokens: font.bodyOptions), for a sample shown in that font */
export const fontFamily = (id: string) => `var(--font-option-${id})`;

/** Loads a body font once; an unknown id is ignored */
export function loadFont(id: string): void {
  if (loaded.has(id) || !LOADERS[id]) return;
  loaded.add(id);
  void LOADERS[id]!().catch(() => loaded.delete(id));
}
