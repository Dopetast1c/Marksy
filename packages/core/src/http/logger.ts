import type { Logger } from '../providers/types';

// The redacting logger (CLAUDE.md "Hard rules": never log tokens, passwords or full names; design.md 14.1: never a
// whole provider response). Everything a provider or the collector logs goes through it. Strings are allowed, not
// denied: a string value survives only under a known technical key, or when it looks like an enum, a date or a code.
// Everything else (names, free text from the diary, whole responses) becomes [redacted], whatever its key is called.

const REDACTED = '[redacted]';
const MAX_DEPTH = 6;

/** Keys whose whole value is dropped: credentials, people, free text, and whole responses. */
const SECRET_KEY =
  /pass|token|secret|auth|cookie|credential|session|login|jwt|bearer|sid|otp|key|name|fio|mail|phone|comment|note|body|text|message|homework|topic|summary|description|teacher|pupil|student|school|raw|data|response|payload|value/i;

/** Technical keys whose short, single-token string values are logged as they are (after scrubbing). */
const SAFE_KEYS = new Set([
  'method',
  'path',
  'url',
  'status',
  'attempt',
  'endpoint',
  'kind',
  'count',
  'week',
  'from',
  'to',
  'date',
  'provider',
  'outcome',
  'reason',
  'code',
  'unit',
  'level',
]);
const SAFE_SHAPE = /^[\w.:/?@+=,~%[\]-]{0,120}$/;
/** Values that carry no personal text under any key: UPPER_SNAKE enums, ISO dates and times, short numbers. */
const NEUTRAL_VALUE = /^(?:[A-Z][A-Z0-9_]{0,39}|\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?|\d{1,5})$/;

const SCRUB: [RegExp, string][] = [
  [/bearer\s+\S+/gi, `Bearer ${REDACTED}`],
  [/\bbasic\s+[A-Za-z0-9+/=]{8,}/gi, `Basic ${REDACTED}`],
  [/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, REDACTED],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, REDACTED],
  [/\b(set-cookie|cookie)\s*:\s*[^\n]*/gi, `$1: ${REDACTED}`],
  [/\b(password|passwd|pwd|token|secret|api[_-]?key)\s*[=:]\s*\S+/gi, `$1=${REDACTED}`],
  [/\?[^\s#]*=[^\s#]*/g, `?${REDACTED}`],
];

/** Removes tokens, credentials, cookies, e-mail addresses and query strings from free text. */
export function scrub(text: string): string {
  return SCRUB.reduce((s, [re, to]) => s.replace(re, to), text);
}

function cleanString(key: string | null, s: string): string {
  const scrubbed = scrub(s);
  if (NEUTRAL_VALUE.test(scrubbed)) return scrubbed;
  return key !== null && SAFE_KEYS.has(key) && SAFE_SHAPE.test(scrubbed) ? scrubbed : REDACTED;
}

function clean(key: string | null, value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (typeof value === 'string') return cleanString(key, value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) return value;
  if (typeof value !== 'object') return `[${typeof value}]`;
  if (value instanceof Error) return { name: value.name, message: scrub(value.message) };
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return '[binary]';
  if (value instanceof Map || value instanceof Set) return '[collection]';
  if (seen.has(value)) return '[circular]';
  if (depth >= MAX_DEPTH) return '[deep]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => clean(key, v, depth + 1, seen));
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [k, SECRET_KEY.test(k) ? REDACTED : clean(k, v, depth + 1, seen)]),
  );
}

/** A copy of log data that is safe to write anywhere. */
export function redact(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  return data && (clean(null, data, 0, new WeakSet()) as Record<string, unknown>);
}

/** The message is written by code, so it is kept, scrubbed; anything that is not a string is reduced to a label. */
function message(msg: unknown): string {
  if (typeof msg === 'string') return scrub(msg);
  if (msg instanceof Error) return scrub(msg.message);
  return '[non-string message]';
}

export type LogSink = (level: keyof Logger, msg: string, data?: Record<string, unknown>) => void;

/** A logger that redacts the message and the data before they reach the sink. */
export function createLogger(sink: LogSink): Logger {
  const at = (level: keyof Logger) => (msg: string, data?: Record<string, unknown>) =>
    sink(level, message(msg), redact(data && typeof data === 'object' ? data : undefined));
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error') };
}

/** Wraps any logger (pino, console) so that nothing reaches it unredacted. */
export function redacting(log: Logger): Logger {
  return createLogger((level, msg, data) => log[level](msg, data));
}

export const silentLogger: Logger = createLogger(() => undefined);
