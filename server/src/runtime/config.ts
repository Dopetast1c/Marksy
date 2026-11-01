import { normalizeBasePath } from './network';

// How the server runs, from the environment (env.example, "Server" and "Production"). NODE_ENV=production changes the
// defaults: sign-up only for the first family, Swagger behind a session, the internal port on.

type Env = Record<string, string | undefined>;

export interface RuntimeConfig {
  port: number;
  host: string;
  basePath: string;
  trustProxy: string;
  signup: 'open' | 'first' | 'closed';
  apiDocs: 'open' | 'session' | 'off';
  /** The port of the internal status (runtime/internal.ts); null when no token is set */
  internal: { port: number; token: string } | null;
  production: boolean;
}

function oneOf<T extends string>(env: Env, key: string, allowed: readonly T[], fallback: T): T {
  const v = env[key]?.trim().toLowerCase();
  if (!v) return fallback;
  if (!(allowed as readonly string[]).includes(v)) throw new Error(`${key} must be one of ${allowed.join(', ')}`);
  return v as T;
}

export function readRuntimeConfig(env: Env = process.env): RuntimeConfig {
  const production = env.NODE_ENV?.trim() === 'production';
  const token = env.MARKSY_INTERNAL_TOKEN?.trim() ?? '';
  if (token && token.length < 32) throw new Error('MARKSY_INTERNAL_TOKEN must be 32 characters or more');
  return {
    port: Number(env.PORT ?? 3000),
    // the API listens on this machine only in development; in a container it listens on the compose network
    host: env.HOST?.trim() || '127.0.0.1',
    basePath: normalizeBasePath(env.BASE_PATH),
    trustProxy: env.TRUST_PROXY?.trim() || 'loopback',
    signup: oneOf(env, 'SIGNUP', ['open', 'first', 'closed'], production ? 'first' : 'open'),
    apiDocs: oneOf(env, 'API_DOCS', ['open', 'session', 'off'], production ? 'session' : 'open'),
    internal: token ? { port: Number(env.INTERNAL_PORT ?? 3001), token } : null,
    production,
  };
}
