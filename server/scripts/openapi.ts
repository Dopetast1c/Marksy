import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openApiJson } from '../src/openapi-export';

// `pnpm --filter @marksy/server openapi`: writes the API document to web/src/api/openapi.json (src/openapi-export.ts).
// Then `pnpm --filter @marksy/web api:types` turns it into web/src/api/schema.d.ts.

const target = fileURLToPath(new URL('../../web/src/api/openapi.json', import.meta.url));
writeFileSync(target, openApiJson());
console.log('web/src/api/openapi.json written');
