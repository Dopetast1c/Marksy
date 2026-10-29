import { extendZodWithOpenApi, OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

// The API contract (docs/design.md 9): every route is described once with Zod, which both validates and generates the
// OpenAPI 3.1 document served at /api/openapi.json and as Swagger UI at /api/docs. Routes register themselves here
// next to their handler; M4 adds the read API.

extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

/** Errors everywhere: { error: { code, message, details? } } */
export const apiError = registry.register(
  'Error',
  z.object({
    error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
  }),
);

/**
 * The document; a running server names its version and its BASE_PATH (so "Try it out" calls the right address), the
 * exported one for the web app's types stays the same from one version to the next
 */
export function openApiDocument(opts: { basePath?: string; version?: string } = {}) {
  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Marksy API',
      version: opts.version ?? '0.0.0',
      description:
        'The API of the Marksy PWA. JSON, camelCase, dates as ISO strings. Every route except login, invites, health and docs needs a session; connecting a diary signed out only where signing up is open.',
    },
    servers: [{ url: opts.basePath || '/' }],
  });
}
