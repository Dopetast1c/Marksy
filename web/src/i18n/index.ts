import { CATALOGS, languageOf, LANGUAGES, resolveLanguage, SOURCE_LANGUAGE } from '@marksy/i18n';
import type { ShortDateStyle } from '@marksy/core';
import i18next from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

// react-i18next over the catalogs of packages/i18n (docs/i18n.md 2): the same JSON as the server, English as the
// fallback key by key, plurals with the _one/_few/_many/_other suffixes, {{x}} placeholders. Numbers and dates are
// formatted with Intl before they reach t(). The device remembers the choice made on the login screen; after sign-in
// the user's saved language wins (docs/i18n.md 3).

const DEVICE_KEY = 'marksy.lang';

function deviceLanguage(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}

export function initialLanguage(): string {
  return resolveLanguage({
    saved: deviceLanguage(),
    browser: typeof navigator === 'undefined' ? [] : navigator.languages,
  });
}

export const i18n = i18next.createInstance();

export function initI18n(lng = initialLanguage()) {
  if (i18n.isInitialized) return i18n;
  void i18n.use(initReactI18next).init({
    lng,
    fallbackLng: SOURCE_LANGUAGE,
    supportedLngs: LANGUAGES.map((l) => l.code),
    resources: Object.fromEntries(Object.entries(CATALOGS).map(([code, m]) => [code, { translation: m }])),
    // the keys are flat with dots ("overview.average"), not nested objects
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  applyDocumentLanguage(lng);
  return i18n;
}

function applyDocumentLanguage(lng: string) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lng;
  document.documentElement.dir = languageOf(lng)?.dir ?? 'ltr';
}

/** Switches the interface language and remembers it on this device */
export async function setLanguage(lng: string) {
  try {
    localStorage.setItem(DEVICE_KEY, lng);
  } catch {
    // a private window: the choice lasts for this visit
  }
  await i18n.changeLanguage(lng);
  applyDocumentLanguage(lng);
}

/** The BCP 47 tag for Intl in the current language */
export const intlLocale = () => languageOf(i18n.language)?.intl ?? 'en-GB';

/**
 * How short dates are written in the current language (core shortDate, shortRange): the language's own short month
 * names when its catalog has them, otherwise Intl's. Never English months in another language.
 */
export function dateStyle(): ShortDateStyle {
  const own = CATALOGS[i18n.language];
  const months = Array.from({ length: 12 }, (_, i) => own?.[`date.monthShort.${i + 1}`]);
  return { locale: intlLocale(), months: months.every(Boolean) ? (months as string[]) : null };
}

export const useT = () => useTranslation().t;
