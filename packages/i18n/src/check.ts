import { languageOf, SOURCE_LANGUAGE } from './languages';
import type { Messages } from './translate';

// The rules of `pnpm i18n:check` (docs/i18n.md 5), as a pure function so a unit test runs them on the real files.
// A missing key is an error in the complete languages (en, ru) and a warning in the others until M5e translates them.

export const COMPLETE_LANGUAGES = ['en', 'ru'];

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

const placeholders = (s: string) => new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]!));
const isMeta = (key: string) => key.endsWith('_comment');

/** Plural groups: base key -> categories present. Plain keys map to null. */
function groups(messages: Messages): Map<string, Set<string> | null> {
  const out = new Map<string, Set<string> | null>();
  for (const key of Object.keys(messages)) {
    if (isMeta(key)) continue;
    const m = key.match(PLURAL_SUFFIX);
    if (!m) {
      out.set(key, null);
      continue;
    }
    const base = key.slice(0, -m[0].length);
    const set = out.get(base) ?? new Set<string>();
    set.add(m[1]!);
    out.set(base, set);
  }
  return out;
}

export function checkCatalogs(catalogs: Readonly<Record<string, Messages>>): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const source = catalogs[SOURCE_LANGUAGE];
  if (!source) return { errors: [`${SOURCE_LANGUAGE}.json is missing`], warnings };
  const sourceGroups = groups(source);
  const sourceText = (base: string) =>
    Object.entries(source)
      .filter(([k]) => k === base || k.replace(PLURAL_SUFFIX, '') === base)
      .map(([, v]) => v)
      .join(' ');

  for (const [lang, messages] of Object.entries(catalogs)) {
    const report = COMPLETE_LANGUAGES.includes(lang) ? errors : warnings;
    const lg = languageOf(lang);
    if (!lg) {
      errors.push(`${lang}: not in languages.ts`);
      continue;
    }
    const needed = new Intl.PluralRules(lg.intl).resolvedOptions().pluralCategories as string[];
    const own = groups(messages);

    for (const [base, cats] of sourceGroups) {
      if (!own.has(base)) {
        report.push(`${lang}: missing ${base}`);
        continue;
      }
      const ownCats = own.get(base);
      if ((cats === null) !== (ownCats === null || ownCats === undefined)) {
        errors.push(`${lang}: ${base} is ${cats ? 'plural' : 'plain'} in ${SOURCE_LANGUAGE}`);
        continue;
      }
      if (ownCats) {
        // "other" is the fallback; every category the language uses must be written out
        const missing = needed.filter((c) => !ownCats.has(c));
        if (missing.length) report.push(`${lang}: ${base} lacks plural forms ${missing.join(', ')}`);
      }
      const allowed = placeholders(sourceText(base));
      for (const [key, text] of Object.entries(messages)) {
        if (key !== base && key.replace(PLURAL_SUFFIX, '') !== base) continue;
        for (const p of placeholders(text)) {
          if (!allowed.has(p)) errors.push(`${lang}: ${key} uses {{${p}}} which ${SOURCE_LANGUAGE} does not have`);
        }
      }
    }
    for (const base of own.keys()) {
      if (!sourceGroups.has(base)) errors.push(`${lang}: ${base} does not exist in ${SOURCE_LANGUAGE}`);
    }
  }
  return { errors, warnings };
}
