// pnpm i18n:check: fails on errors in the catalogs, prints warnings for languages not translated yet (docs/i18n.md 5).
import { CATALOGS, checkCatalogs } from '../src/index';

const { errors, warnings } = checkCatalogs(CATALOGS);
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`i18n check: ${errors.length} errors, ${warnings.length} warnings, ${Object.keys(CATALOGS).join(', ')}`);
process.exit(errors.length ? 1 : 0);
