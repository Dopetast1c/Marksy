/** Rounds half up to the given number of decimals, the way averages are shown (7.45 -> 7.5 at one decimal). */
export function roundHalfUp(value: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Removes binary noise (7.499999999 -> 7.5) before a comparison or a ceil. */
export function clean(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}
