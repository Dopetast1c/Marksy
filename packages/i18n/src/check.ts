import { languageOf, SOURCE_LANGUAGE } from './languages';
import type { Messages } from './translate';

// The rules of `pnpm i18n:check` (docs/i18n.md 5), as a pure function so a unit test runs them on the real files.
// A missing or stale key is an error in the complete languages (en, ru) and a warning in the machine translations;
// `pnpm i18n:check --strict` turns the warnings into failures, and every milestone merges only with it green.

export const COMPLETE_LANGUAGES = ['en', 'ru'];

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;
const MAX_CHARS = /max (\d+) chars/;

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

/**
 * Which English text each translation was made from (locales/_source.json): language -> base key -> the hash of the
 * key's English text (all plural forms). A translation whose stamp differs from the English text of today is stale.
 */
export type SourceStamps = Readonly<Record<string, Readonly<Record<string, string>>>>;

const placeholders = (s: string) => new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]!));
const isMeta = (key: string) => key.endsWith('_comment');
const baseOf = (key: string) => key.replace(PLURAL_SUFFIX, '');

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

/** A short, stable hash of a string (53-bit cyrb53), so the stamps file stays small and needs no crypto module */
function hash(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** The stamp of every base key of the source: what a translation made today is made from */
export function sourceStamps(source: Messages): Record<string, string> {
  const texts = new Map<string, string[]>();
  for (const key of Object.keys(source).sort()) {
    if (isMeta(key)) continue;
    const base = baseOf(key);
    texts.set(base, [...(texts.get(base) ?? []), `${key}=${source[key]}`]);
  }
  return Object.fromEntries([...texts].map(([base, parts]) => [base, hash(parts.join('\n'))]));
}

/** The keys with a length limit (`"tabs.home_comment": "max 11 chars"`) and their limit */
function limits(source: Messages): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, text] of Object.entries(source)) {
    const m = isMeta(key) ? text.match(MAX_CHARS) : null;
    if (m) out.set(key.slice(0, -'_comment'.length), Number(m[1]));
  }
  return out;
}

export function checkCatalogs(catalogs: Readonly<Record<string, Messages>>, stamps?: SourceStamps): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const source = catalogs[SOURCE_LANGUAGE];
  if (!source) return { errors: [`${SOURCE_LANGUAGE}.json is missing`], warnings };
  const sourceGroups = groups(source);
  const current = sourceStamps(source);
  const maxChars = limits(source);
  const sourceText = (base: string) =>
    Object.entries(source)
      .filter(([k]) => k === base || baseOf(k) === base)
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
      if (stamps && lang !== SOURCE_LANGUAGE && stamps[lang]?.[base] !== current[base])
        report.push(`${lang}: ${base} is stale, ${SOURCE_LANGUAGE} changed since it was translated`);
      const allowed = placeholders(sourceText(base));
      const max = maxChars.get(base);
      for (const [key, text] of Object.entries(messages)) {
        if (key !== base && baseOf(key) !== base) continue;
        for (const p of placeholders(text)) {
          if (!allowed.has(p)) errors.push(`${lang}: ${key} uses {{${p}}} which ${SOURCE_LANGUAGE} does not have`);
        }
        const length = [...text].length;
        if (max !== undefined && length > max) errors.push(`${lang}: ${key} has ${length} characters, at most ${max}`);
      }
    }
    for (const base of own.keys()) {
      if (!sourceGroups.has(base)) errors.push(`${lang}: ${base} does not exist in ${SOURCE_LANGUAGE}`);
    }
  }
  return { errors, warnings };
}
