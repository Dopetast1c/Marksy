import {
  CATALOGS,
  languageOf,
  LANGUAGES,
  pseudoCatalog,
  PSEUDO_LOCALE,
  resolveLanguage,
  SOURCE_LANGUAGE,
} from '@marksy/i18n';
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

const OVERRIDE_KEY = 'marksy.lang.override';

/**
 * Development only: a language for this device that wins over the user's saved one, so `pnpm smoke:ui --lang` and
 * the pseudo-locale can show any language without changing a user (docs/i18n.md 5). Picking a language clears it.
 */
export function languageOverride(): string | null {
  if (!import.meta.env.DEV) return null;
  try {
    const lng = localStorage.getItem(OVERRIDE_KEY);
    return lng && (lng === PSEUDO_LOCALE || languageOf(lng)) ? lng : null;
  } catch {
    return null;
  }
}

/** Development only: shows this device in a language (or the pseudo-locale) without saving it for the user */
export async function setLanguageOverride(lng: string) {
  if (!import.meta.env.DEV) return;
  try {
    localStorage.setItem(OVERRIDE_KEY, lng);
  } catch {
    // a private window: the override lasts for this visit
  }
  await i18n.changeLanguage(lng);
  applyDocumentLanguage(lng);
}

export function initialLanguage(): string {
  return (
    languageOverride() ??
    resolveLanguage({
      saved: deviceLanguage(),
      browser: typeof navigator === 'undefined' ? [] : navigator.languages,
    })
  );
}

export const i18n = i18next.createInstance();

/** The catalogs the app loads: the shipped languages, and in development the pseudo-locale built from English */
function resources() {
  const catalogs = import.meta.env.DEV ? { ...CATALOGS, [PSEUDO_LOCALE]: pseudoCatalog(CATALOGS.en!) } : CATALOGS;
  return Object.fromEntries(Object.entries(catalogs).map(([code, m]) => [code, { translation: m }]));
}

export function initI18n(lng = initialLanguage()) {
  if (i18n.isInitialized) return i18n;
  void i18n.use(initReactI18next).init({
    lng,
    fallbackLng: SOURCE_LANGUAGE,
    supportedLngs: [...LANGUAGES.map((l) => l.code), ...(import.meta.env.DEV ? [PSEUDO_LOCALE] : [])],
    resources: resources(),
    // the keys are flat with dots ("overview.average"), not nested objects
    keySeparator: false,
    nsSeparator: false,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  applyDocumentLanguage(lng);
  // development only: pnpm smoke:ui finds buttons and fields by key, whatever the language on screen
  if (import.meta.env.DEV && typeof window !== 'undefined')
    (window as Window & { __marksyT?: (key: string) => string }).__marksyT = (key) => i18n.t(key);
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
    localStorage.removeItem(OVERRIDE_KEY);
    localStorage.setItem(DEVICE_KEY, lng);
  } catch {
    // a private window: the choice lasts for this visit
  }
  await i18n.changeLanguage(lng);
  applyDocumentLanguage(lng);
}

const PENDING_KEY = 'marksy.lang.pending';

/**
 * A language chosen before there is a user to save it on (the login screen, a connect or an invite in that
 * language): after sign-in it becomes the user's (PATCH /api/me), otherwise the user's saved language wins.
 */
export function rememberForUser(lng: string) {
  try {
    localStorage.setItem(PENDING_KEY, lng);
  } catch {
    // a private window: nothing to carry over
  }
}

export function takePendingLanguage(): string | null {
  try {
    const lng = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    return lng;
  } catch {
    return null;
  }
}

/** The BCP 47 tag for Intl in the current language */
export const intlLocale = () => languageOf(i18n.language)?.intl ?? 'en-GB';

/**
 * How short dates are written in the current language (core shortDate, shortRange): the language's own short month
 * names when its catalog has them, otherwise Intl's. Never English months in another language.
 */
/**
 * A month on its own, not in a date (the year strip of Школа): «май», where a date says «25 мая». The language's own
 * names when its catalog has them, otherwise Intl's stand-alone short form.
 */
export function monthAlone(month: number): string {
  const own = CATALOGS[i18n.language]?.[`date.monthAlone.${month}`];
  return (
    own ??
    new Intl.DateTimeFormat(intlLocale(), { timeZone: 'UTC', month: 'short' }).format(
      new Date(Date.UTC(2026, month - 1, 15)),
    )
  );
}

export function dateStyle(): ShortDateStyle {
  const own = CATALOGS[i18n.language];
  const months = Array.from({ length: 12 }, (_, i) => own?.[`date.monthShort.${i + 1}`]);
  return { locale: intlLocale(), months: months.every(Boolean) ? (months as string[]) : null };
}

export const useT = () => useTranslation().t;
