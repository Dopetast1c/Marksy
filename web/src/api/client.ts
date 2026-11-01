import createClient from 'openapi-fetch';
import { BASE } from '../lib/base';
import type { components, paths } from './schema';

// The typed client (docs/design.md 13) over the types generated from the server's OpenAPI document. The browser only
// ever talks to its own origin: every path is a /api one under the app's base path, so the app works on localhost,
// over the home network through the dev server's proxy and behind a reverse proxy at any path alike (CLAUDE.md "Local
// and phone testing", docs/running.md).

export const api = createClient<paths>({
  // the page's own origin, whatever it is (localhost, the computer's address on the home network, a public host),
  // and the path the app is served under
  baseUrl: typeof location === 'undefined' ? BASE : `${location.origin}${BASE}`,
  credentials: 'same-origin',
  // looked up on every call, so tests can replace it
  fetch: (request) => globalThis.fetch(request),
});

export type Schemas = components['schemas'];
export type ApiError = Schemas['Error']['error'];
/** An interface language the API stores for a user */
export type Locale = NonNullable<
  NonNullable<paths['/api/me']['patch']['requestBody']>['content']['application/json']['locale']
>;

/** Thrown by `data()` for any answer that is not a success */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError | null,
  ) {
    super(error?.code ?? `http_${status}`);
  }
}

/** The body of a successful answer, or an ApiFailure */
export async function data<T>(call: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data: body, error, response } = await call;
  if (response.ok) return body as T;
  const err = (error as { error?: ApiError } | undefined)?.error ?? null;
  throw new ApiFailure(response.status, err);
}

let onSignedOut: () => void = () => {};
/** What the app does when a session ends under it (expired, signed out elsewhere): back to the login */
export function whenSignedOut(fn: () => void) {
  onSignedOut = fn;
}

api.use({
  onResponse({ response, request }) {
    // a 401 from anything but the login itself means the session is gone
    if (response.status === 401 && !request.url.includes('/api/auth/')) onSignedOut();
    return response;
  },
});
