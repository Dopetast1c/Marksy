import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tokensToCss } from './tokens';

// `pnpm --filter @marksy/web tokens`: writes web/src/styles/tokens.css from docs/tokens.json (docs/design.md 12).
// A test fails when the file is older than the tokens.

export const TOKENS_JSON = fileURLToPath(new URL('../../docs/tokens.json', import.meta.url));
export const TOKENS_CSS = fileURLToPath(new URL('../src/styles/tokens.css', import.meta.url));

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeFileSync(TOKENS_CSS, tokensToCss(JSON.parse(readFileSync(TOKENS_JSON, 'utf8'))));
  console.log('web/src/styles/tokens.css written');
}
