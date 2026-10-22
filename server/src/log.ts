import { createLogger } from '@marksy/core';
import type { Logger } from '@marksy/core';

// The server's logger: core's redacting logger over the console, so no token, password, name or diary text reaches
// the log whatever a caller passes (CLAUDE.md "Hard rules").
export const log: Logger = createLogger((level, msg, data) => {
  const line = data && Object.keys(data).length ? `${msg} ${JSON.stringify(data)}` : msg;
  if (level === 'debug') return;
  console[level](`[${new Date().toISOString()}] ${line}`);
});

/**
 * An error as it may be shown: its class and, for database and network errors, the code. Never the message, which
 * for a failed query carries the SQL parameters (a login, a name) and for a provider may carry a response.
 */
export function errorSummary(err: unknown): string {
  if (!(err instanceof Error)) return 'Error';
  const code = (err as { code?: unknown }).code ?? (err.cause as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && /^[\w-]{1,20}$/.test(code) ? `${err.name} ${code}` : err.name;
}
