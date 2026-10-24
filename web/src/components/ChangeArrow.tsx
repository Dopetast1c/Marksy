// The change versus the previous period (ux-principles principle 2, D5): a small arrow in the direction colour,
// green when the change is for the better on this scale, red for the worse, grey for none. The arrow points where the
// number went (delta), the colour says whether that is good (trend, already scale-aware from the API). It is never
// drawn as a filled badge, and never without two real values (D23): the caller passes nothing then.

export function ChangeArrow({ delta, trend }: { delta: number | null; trend: 'up' | 'down' | 'flat' | null }) {
  if (delta == null || trend == null) return null;
  const glyph = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  const colour = trend === 'up' ? 'text-band-good-fg' : trend === 'down' ? 'text-band-critical-fg' : 'text-ink3';
  return (
    <span aria-hidden="true" className={`ml-0.5 font-body text-[0.6em] font-extrabold ${colour}`}>
      {glyph}
    </span>
  );
}
