import type { Logger } from '../providers/types';

// The redacting logger (CLAUDE.md "Hard rules": never log tokens, passwords or full names). Everything a provider or
// the collector logs goes through it: keys that can carry a secret or personal text are replaced whole, strings are
// scrubbed of bearer tokens, JWTs, e-mail addresses and query strings, errors are reduced to name and message.

/** Keys whose values are never logged: credentials, and fields that hold names or free text from the diary. */
const SECRET_KEY =
  /pass|token|secret|auth|cookie|credential|session|login|jwt|bearer|sid|otp|key|name|mail|phone|comment|note|body|text/i;
const REDACTED = '[redacted]';
const MAX_DEPTH = 6;

const SCRUB: [RegExp, string][] = [
  [/bearer\s+\S+/gi, `Bearer ${REDACTED}`],
  [/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, REDACTED],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, REDACTED],
  [/\?[^\s#]*=[^\s#]*/g, `?${REDACTED}`],
];

/** Removes tokens, e-mail addresses and query strings from free text. */
export function scrub(text: string): string {
  return SCRUB.reduce((s, [re, to]) => s.replace(re, to), text);
}

function clean(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return scrub(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return { name: value.name, message: scrub(value.message) };
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[deep]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1, seen));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? REDACTED : clean(v, depth + 1, seen)]),
  );
}

/** A copy of log data that is safe to write anywhere. */
export function redact(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return data && (clean(data, 0, new WeakSet()) as Record<string, unknown>);
}

export type LogSink = (level: keyof Logger, msg: string, data?: Record<string, unknown>) => void;

/** A logger that redacts the message and the data before they reach the sink. */
export function createLogger(sink: LogSink): Logger {
  const at = (level: keyof Logger) => (msg: string, data?: Record<string, unknown>) =>
    sink(level, scrub(msg), redact(data));
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}

/** Wraps any logger (pino, console) so that nothing reaches it unredacted. */
export function redacting(log: Logger): Logger {
  return createLogger((level, msg, data) => log[level](msg, data));
}

export const silentLogger: Logger = createLogger(() => undefined);
