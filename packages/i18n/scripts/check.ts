// pnpm i18n:check [--strict]: fails on errors in the catalogs and prints the warnings (missing or stale keys of the
// machine translations); --strict fails on warnings too, and is green before every merge (docs/i18n.md 5).
import { CATALOGS, checkCatalogs } from '../src/index';
import { readStamps } from './stamps';

const strict = process.argv.includes('--strict');
const { errors, warnings } = checkCatalogs(CATALOGS, readStamps());
for (const w of warnings) console.warn(`warning: ${w}`);
for (const e of errors) console.error(`error: ${e}`);
console.log(`i18n check: ${errors.length} errors, ${warnings.length} warnings, ${Object.keys(CATALOGS).join(', ')}`);
process.exit(errors.length || (strict && warnings.length) ? 1 : 0);
