import { createApp } from './app';
import type { AppDeps } from './http/context';
import { openApiDocument } from './openapi';

// The OpenAPI document without a database or a server: every route registers itself when the app is built, and no
// handler runs. `pnpm --filter @marksy/server openapi` writes it to web/src/api/openapi.json, from which the web app
// generates its types (docs/design.md 13); a test in each package checks that both files are current.

let built = false;

export function exportOpenApi(): unknown {
  if (!built) {
    createApp({} as AppDeps);
    built = true;
  }
  return openApiDocument();
}

export const openApiJson = () => `${JSON.stringify(exportOpenApi(), null, 2)}\n`;
