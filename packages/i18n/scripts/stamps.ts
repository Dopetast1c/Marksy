import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { SourceStamps } from '../src/check';

// locales/_source.json: which English text each translation was made from (docs/i18n.md 5). Read by i18n:check,
// written only by i18n:stamp.

export const STAMPS_FILE = fileURLToPath(new URL('../src/locales/_source.json', import.meta.url));

export function readStamps(): SourceStamps {
  return JSON.parse(readFileSync(STAMPS_FILE, 'utf8')) as SourceStamps;
}

export function writeStamps(stamps: SourceStamps) {
  // sorted, so a change touches only its own lines
  const sorted = Object.fromEntries(
    Object.keys(stamps)
      .sort()
      .map((lang) => [lang, Object.fromEntries(Object.entries(stamps[lang]!).sort(([a], [b]) => a.localeCompare(b)))]),
  );
  writeFileSync(STAMPS_FILE, `${JSON.stringify(sorted, null, 2)}\n`);
}
