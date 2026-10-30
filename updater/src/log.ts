// One JSON line per event on stdout (docker logs): an event name and numbers, versions, digests and outcomes only.

type Fields = Record<string, string | number | boolean | null | undefined>;

function line(level: string, msg: string, fields?: Fields) {
  process.stdout.write(`${JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields })}\n`);
}

export const log = {
  info: (msg: string, fields?: Fields) => line('info', msg, fields),
  warn: (msg: string, fields?: Fields) => line('warn', msg, fields),
  error: (msg: string, fields?: Fields) => line('error', msg, fields),
};

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);
