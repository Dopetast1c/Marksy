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
  /**
   * How far the strings can be trusted (locales/STATUS.md, a test keeps the two in step): source (en), reviewed by a
   * native speaker, machine translation, or todo (no file yet, English key by key). More (tabs.more) says so for anything but the
   * first two (design.md 5.6).
   */
  status: 'source' | 'reviewed' | 'machine' | 'todo';
  /** Nouns keep their capital inside a sentence (German): a term word or a tag name is not lower-cased there */
  capitalNouns?: true;
}

export const LANGUAGES: readonly Language[] = [
  { code: 'ru', name: 'Russian', nativeName: 'Русский', dir: 'ltr', intl: 'ru-RU', status: 'reviewed' },
  { code: 'be', name: 'Belarusian', nativeName: 'Беларуская', dir: 'ltr', intl: 'be-BY', status: 'machine' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', dir: 'ltr', intl: 'uk-UA', status: 'machine' },
  { code: 'kk', name: 'Kazakh', nativeName: 'Қазақша', dir: 'ltr', intl: 'kk-KZ', status: 'machine' },
  { code: 'en', name: 'English', nativeName: 'English', dir: 'ltr', intl: 'en-GB', status: 'source' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', dir: 'ltr', intl: 'pl-PL', status: 'machine' },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    dir: 'ltr',
    intl: 'de-DE',
    status: 'machine',
    capitalNouns: true,
  },
  { code: 'es', name: 'Spanish', nativeName: 'Español', dir: 'ltr', intl: 'es-ES', status: 'machine' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', dir: 'ltr', intl: 'pt-PT', status: 'machine' },
  { code: 'fr', name: 'French', nativeName: 'Français', dir: 'ltr', intl: 'fr-FR', status: 'machine' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', dir: 'ltr', intl: 'nl-NL', status: 'machine' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', dir: 'ltr', intl: 'ro-RO', status: 'machine' },
];

export const SOURCE_LANGUAGE = 'en';

/** A language whose strings someone has checked: the source or a reviewed translation */
export const isReviewed = (l: Language) => l.status === 'source' || l.status === 'reviewed';

export function languageOf(code: string): Language | undefined {
  return LANGUAGES.find((l) => l.code === code);
}

/**
 * A word that stands alone as a label ("Quarter" (term.quarter), "Today" (day.today), a tag's name) written inside a sentence: lower case,
 * except in a language whose nouns keep their capital. Takes a language code or an Intl tag.
 */
export function inSentence(word: string, locale: string): string {
  const lg = languageOf(locale.split('-')[0]!.toLowerCase());
  return lg?.capitalNouns ? word : word.toLocaleLowerCase(lg?.intl ?? locale);
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
