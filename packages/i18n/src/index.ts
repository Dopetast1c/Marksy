// @marksy/i18n: the interface languages, the message catalogs and a small t() for the server and the web app.
// Rules and the how-to-add-a-language guide: docs/i18n.md.

import en from './locales/en.json';
import ru from './locales/ru.json';
import { createT } from './translate';
import type { Messages, T } from './translate';

export * from './languages';
export * from './translate';
export * from './check';
export * from './consent';
export * from './pseudo';

/** Every catalog that exists. Languages without a file fall back to English key by key (until milestone M5e). */
export const CATALOGS: Readonly<Record<string, Messages>> = { en, ru };

/** t() for a language over the shipped catalogs. */
export function translator(locale: string): T {
  return createT(locale, CATALOGS);
}
