// «С кого начнём?» (docs/design.md 4, ux-principles D7): the selected child is remembered on the device with the time
// of the last activity. On launch, or when the app comes back to the foreground, a child stored more than 12 hours ago
// is forgotten and the picker shows; «Всегда начинать с последнего» skips the rule. A parent with one child and a
// student never see the picker.

export const PICK_AFTER_MS = 12 * 60 * 60 * 1000;

export interface StoredPick {
  id: string;
  /** epoch ms of the last activity on this device */
  lastActive: number;
}

/** The child to continue with, or null when the picker must show */
export function restoredChild(
  stored: StoredPick | null,
  opts: { alwaysLast: boolean; now: number; childIds: readonly string[]; role: 'admin' | 'parent' | 'student' },
): string | null {
  // nothing to choose: the only child, or the student themself
  if (opts.role === 'student' || opts.childIds.length === 1) return opts.childIds[0] ?? null;
  if (!stored || !opts.childIds.includes(stored.id)) return null;
  if (opts.alwaysLast) return stored.id;
  return opts.now - stored.lastActive <= PICK_AFTER_MS ? stored.id : null;
}
