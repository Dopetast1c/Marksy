import { createLogger } from '@marksy/core';
import type { Logger } from '@marksy/core';

// The server's logger: core's redacting logger over the console, so no token, password, name or diary text reaches
// the log whatever a caller passes (CLAUDE.md "Hard rules").
export const log: Logger = createLogger((level, msg, data) => {
  const line = data && Object.keys(data).length ? `${msg} ${JSON.stringify(data)}` : msg;
  if (level === 'debug') return;
  console[level](`[${new Date().toISOString()}] ${line}`);
});
