import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { openApiJson } from './openapi-export';

describe('the API document the web app is built on', () => {
  it('web/src/api/openapi.json is current (pnpm --filter @marksy/server openapi)', () => {
    const committed = readFileSync(new URL('../../web/src/api/openapi.json', import.meta.url), 'utf8');
    expect(committed).toBe(openApiJson());
  });
});
