import { languageOf, SOURCE_LANGUAGE } from './languages';

// The tiny t() shared by the server (push, Telegram, digests, API errors) and the web app's i18next setup, over the
// same flat JSON files (docs/i18n.md 2). Plurals follow CLDR through Intl.PluralRules with i18next-style suffixes
// (_one, _few, _many, _other); interpolation is {{name}}. Formatting of numbers and dates happens before t().

export type Messages = Readonly<Record<string, string>>;
export type TParams = Record<string, string | number>;
export type T = (key: string, params?: TParams) => string;

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

export function interpolate(template: string, params: TParams = {}): string {
  return template.replace(PLACEHOLDER, (whole, name: string) => (name in params ? String(params[name]) : whole));
}

/**
 * A translator for one language with English as the fallback for every missing key. A key missing everywhere is
 * returned as is, which the checks catch long before a user sees it.
 */
export function createT(locale: string, catalogs: Readonly<Record<string, Messages>>): T {
  const own = catalogs[locale] ?? {};
  const source = catalogs[SOURCE_LANGUAGE] ?? {};
  const intl = languageOf(locale)?.intl ?? locale;
  const plural = new Intl.PluralRules(intl);
  const sourcePlural = new Intl.PluralRules(languageOf(SOURCE_LANGUAGE)!.intl);

  const lookup = (key: string, count: number | undefined): string | undefined => {
    if (count !== undefined) {
      const fromOwn = own[`${key}_${plural.select(count)}`] ?? own[`${key}_other`];
      if (fromOwn !== undefined) return fromOwn;
      const fromSource = source[`${key}_${sourcePlural.select(count)}`] ?? source[`${key}_other`];
      if (fromSource !== undefined) return fromSource;
    }
    return own[key] ?? source[key];
  };

  return (key, params) => {
    const count = typeof params?.count === 'number' ? params.count : undefined;
    const template = lookup(key, count);
    return template === undefined ? key : interpolate(template, params);
  };
}

/** "a, b or c" in the interface language. */
export function formatList(
  locale: string,
  items: readonly string[],
  type: 'disjunction' | 'conjunction' = 'conjunction',
) {
  return new Intl.ListFormat(languageOf(locale)?.intl ?? locale, { type }).format(items);
}
