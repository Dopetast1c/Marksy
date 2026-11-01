import type { TFunction } from 'i18next';

// What holidays are called (design.md 5.5, 5.2a, 5.9): from their kind as the diary says it ("Autumn holidays",
// holiday.name.*), never guessed from the month; without a known kind just "Holidays" (schedule.holidays).

const NAMED = new Set(['autumn', 'winter', 'spring', 'summer', 'additional']);

/** "Autumn holidays" (holiday.name.*), or "Holidays" (schedule.holidays) */
export function holidayName(t: TFunction, kind: string | null | undefined): string {
  return kind && NAMED.has(kind) ? t(`holiday.name.${kind}`) : t('schedule.holidays');
}

/** "Autumn holidays from 1 Nov" (holiday.from.*), or "Holidays from 1 Nov" (event.holidays) (each language words it
 * whole, no lower-casing in code) */
export function holidaysFrom(t: TFunction, kind: string | null | undefined, date: string): string {
  return kind && NAMED.has(kind) ? t(`holiday.from.${kind}`, { date }) : t('event.holidays', { date });
}
