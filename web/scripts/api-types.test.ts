// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_TS, schemaTypes } from './api-types';

describe('the typed API client', () => {
  it('src/api/schema.d.ts is generated from the current src/api/openapi.json', async () => {
    expect(readFileSync(SCHEMA_TS, 'utf8')).toBe(await schemaTypes());
  });
});
