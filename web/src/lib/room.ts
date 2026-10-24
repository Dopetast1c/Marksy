import type { TFunction } from 'i18next';

// A room as the diary names it (docs/design.md 5.5, D51): a number gets the word for a room («каб. 412»), a name stays
// as it is («спортзал», «актовый зал»), never «каб. спортзал».

export function roomLabel(t: TFunction, room: string | null): string | null {
  if (!room) return null;
  return /^\d/.test(room) ? t('lesson.room', { room }) : room;
}
