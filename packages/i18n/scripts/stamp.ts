// pnpm i18n:stamp <lang|all> <key...> | --every-key: records that these translations were made from today's English
// text, so i18n:check stops calling them stale (docs/i18n.md 5). Stamp only what was actually translated or checked:
// the changed and new keys of a milestone, or a whole new file with --every-key. Keys may be given with or without a
// plural suffix. Stamps of keys that no longer exist are dropped.
import { CATALOGS, SOURCE_LANGUAGE, sourceStamps } from '../src/index';
import { readStamps, writeStamps } from './stamps';

const [target, ...rest] = process.argv.slice(2);
const every = rest.includes('--every-key');
const keys = rest.filter((a) => !a.startsWith('--')).map((k) => k.replace(/_(zero|one|two|few|many|other)$/, ''));
const langs = target === 'all' ? Object.keys(CATALOGS).filter((l) => l !== SOURCE_LANGUAGE) : [target ?? ''];

if (!target || (!every && !keys.length) || langs.some((l) => l === SOURCE_LANGUAGE || !CATALOGS[l])) {
  console.error('usage: pnpm i18n:stamp <lang|all> <key...>   or   pnpm i18n:stamp <lang|all> --every-key');
  process.exit(2);
}

const current = sourceStamps(CATALOGS[SOURCE_LANGUAGE]!);
const unknown = keys.filter((k) => !(k in current));
if (unknown.length) {
  console.error(`not in ${SOURCE_LANGUAGE}.json: ${unknown.join(', ')}`);
  process.exit(2);
}

const stamps: Record<string, Record<string, string>> = Object.fromEntries(
  Object.entries(readStamps()).map(([l, s]) => [l, { ...s }]),
);
for (const lang of langs) {
  const own = new Set(Object.keys(CATALOGS[lang]!).map((k) => k.replace(/_(zero|one|two|few|many|other)$/, '')));
  const mine = (stamps[lang] ??= {});
  for (const base of every ? Object.keys(current) : keys) if (own.has(base)) mine[base] = current[base]!;
  for (const base of Object.keys(mine)) if (!(base in current) || !own.has(base)) delete mine[base];
  console.log(`${lang}: ${every ? 'every key' : keys.length + ' keys'} stamped`);
}
writeStamps(stamps);
