import type { TFunction } from 'i18next';
import type { Schemas } from '../api/client';

// The school day of one child, one line (docs/design.md 4, 5.2, ux-principles D52): on each card of "Who first?"
// (pick.title) and in the "Now" card (nowCard.*) on Home (tabs.home). The API computes it in the school's timezone from the child's own bells.

export type NowLine = Schemas['NowLine'];

export function nowLineText(t: TFunction, line: NowLine): string {
  switch (line.state) {
    case 'before':
      return t('now.before', { at: line.at });
    case 'lesson':
      return line.slot != null
        ? t('now.lesson', { slot: line.slot, until: line.until })
        : t('now.lessonNoSlot', { until: line.until });
    case 'break':
      return line.slot != null
        ? t('now.break', { slot: line.slot, at: line.at })
        : t('now.breakNoSlot', { at: line.at });
    case 'done':
      return t('now.done', { at: line.at });
  }
}
