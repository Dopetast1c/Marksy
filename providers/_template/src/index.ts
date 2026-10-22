import { providerManifest } from '@marksy/core';
import type { DiaryProvider } from '@marksy/core';
import manifestJson from '../provider.json';

// The starting point for a new provider (docs/providers.md 9). Copy the folder to providers/<country>-<system>,
// rename the package, fill in provider.json, then replace every TODO below. Requests go through ctx.http only;
// write the raw schemas with z.looseObject in schemas.ts and the mapping in map.ts, as providers/demo-minimal does.

export const manifest = providerManifest.parse(manifestJson);

const todo = (what: string): never => {
  throw new Error(`TODO: implement ${what}`);
};

export const templateProvider: DiaryProvider = {
  manifest,
  // TODO: POST the credentials with { login: true }; map 401 to ProviderAuthError, 5xx/429 to ProviderUnavailableError
  login: async () => todo('login'),
  getAccount: async () => todo('getAccount'),
  getCalendar: async () => todo('getCalendar'),
  getSubjects: async () => todo('getSubjects'),
  getLessons: async () => todo('getLessons'),
  // TODO: replace names, ids and free text; sanitize(sanitize(x)) must equal sanitize(x)
  sanitize: (_endpoint, raw) => raw,
};

/** TODO: one entry per endpoint, "METHOD /path/pattern" -> fixture file name */
export const ROUTES: Record<string, string> = {};
