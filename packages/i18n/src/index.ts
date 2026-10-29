// @marksy/i18n: the interface languages, the message catalogs and a small t() for the server and the web app.
// Rules and the how-to-add-a-language guide: docs/i18n.md.

import be from './locales/be.json';
import de from './locales/de.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import kk from './locales/kk.json';
import nl from './locales/nl.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ro from './locales/ro.json';
import ru from './locales/ru.json';
import uk from './locales/uk.json';
import { createT } from './translate';
import type { Messages, T } from './translate';

export * from './languages';
export * from './translate';
export * from './check';
export * from './consent';
export * from './pseudo';

/** Every catalog that exists; a key missing in one falls back to English (docs/i18n.md 2) */
export const CATALOGS: Readonly<Record<string, Messages>> = { en, ru, be, uk, kk, pl, de, es, pt, fr, nl, ro };

/** t() for a language over the shipped catalogs. */
export function translator(locale: string): T {
  return createT(locale, CATALOGS);
}
