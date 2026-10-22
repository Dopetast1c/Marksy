// @marksy/core: canonical types, the DiaryProvider interface, grading scales and marks math.
// Nothing here knows a specific diary system (CLAUDE.md, "Provider boundary"). Milestone 1 in docs/build-plan.md fills it.

/** Rounds half up to the given number of decimals, the way averages are shown (7.45 -> 7.5 at one decimal). */
export function roundHalfUp(value: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}
