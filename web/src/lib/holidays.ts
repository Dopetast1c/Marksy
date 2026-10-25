import type { TFunction } from 'i18next';

// What holidays are called (design.md 5.5, 5.2a, 5.9): from their kind as the diary says it («Осенние каникулы»),
// never guessed from the month; without a known kind just «Каникулы».

const NAMED = new Set(['autumn', 'winter', 'spring', 'summer', 'additional']);

/** «Осенние каникулы», or «Каникулы» */
export function holidayName(t: TFunction, kind: string | null | undefined): string {
  return kind && NAMED.has(kind) ? t(`holiday.name.${kind}`) : t('schedule.holidays');
}

/** «С 1 ноября осенние каникулы», or «С 1 ноября каникулы» (each language words it whole, no lower-casing in code) */
export function holidaysFrom(t: TFunction, kind: string | null | undefined, date: string): string {
  return kind && NAMED.has(kind) ? t(`holiday.from.${kind}`, { date }) : t('event.holidays', { date });
}
