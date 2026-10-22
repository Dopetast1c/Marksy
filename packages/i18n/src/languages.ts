// The interface languages (docs/i18n.md 1). Adding one: a JSON file in locales/, a line here, a line in STATUS.md.
// A provider never restricts this list; it only suggests a default and the order of the picker.

export interface Language {
  code: string;
  /** English name */
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
  /** BCP 47 tag for Intl (dates, numbers, plural rules) */
  intl: string;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr', intl: 'ru-RU' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская', dir: 'ltr', intl: 'be-BY' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', dir: 'ltr', intl: 'uk-UA' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша', dir: 'ltr', intl: 'kk-KZ' },
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', intl: 'en-GB' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', dir: 'ltr', intl: 'pl-PL' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', dir: 'ltr', intl: 'de-DE' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', intl: 'es-ES' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr', intl: 'pt-PT' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', intl: 'fr-FR' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', dir: 'ltr', intl: 'nl-NL' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', dir: 'ltr', intl: 'ro-RO' },
];

export const SOURCE_LANGUAGE = 'en';

export function languageOf(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

/**
 * The picker order: the provider's preferred languages first, then the rest in the fixed order above.
 */
export function pickerOrder(preferred: readonly string[] = []): Language[] {
  const first = preferred.map(languageOf).filter((l): l is Language => !!l);
  return [...first, ...LANGUAGES.filter((l) => !first.includes(l))];
}

/**
 * The language to use, first match wins (docs/i18n.md 3): the user's saved choice, the provider's default for a new
 * family, the browser's languages, English.
 */
export function resolveLanguage(input: {
  saved?: string | null;
  providerDefault?: string | null;
  browser?: readonly string[];
}): string {
  const supported = (c: string | null | undefined) => (c && languageOf(c) ? c : null);
  const fromBrowser = (input.browser ?? []).map((tag) => supported(tag.toLowerCase().split('-')[0])).find(Boolean);
  return supported(input.saved) ?? supported(input.providerDefault) ?? fromBrowser ?? SOURCE_LANGUAGE;
}
