import { createHmac, timingSafeEqual } from 'node:crypto';

// The update hook (docs/running.md, updates): POST /_marksy/update-hook through the tunnel, from the release workflow.
// It only says "check now": the updater never takes an image, a version or anything else from the request. It is
// accepted only when it carries a signature, HMAC-SHA256 with UPDATE_HOOK_SECRET over "<timestamp>.<body>", with a
// timestamp within a few minutes of this host's clock, and a signature not seen before; and only a few times a minute.

export const REPLAY_WINDOW_MS = 5 * 60_000;

export type NudgeVerdict = 'ok' | 'unsigned' | 'bad_signature' | 'stale' | 'replayed' | 'too_many';

export function signature(secret: string, timestamp: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

function sameSignature(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checks nudges and remembers the signatures it accepted within the window; at most `perMinute` accepted a minute */
export function createNudgeChecker(secret: string, opts: { perMinute?: number; now?: () => number } = {}) {
  const now = opts.now ?? Date.now;
  const perMinute = opts.perMinute ?? 6;
  const seen = new Map<string, number>();
  const accepted: number[] = [];
  return (headers: { timestamp?: string; signature?: string }, body: string): NudgeVerdict => {
    const t = now();
    for (const [sig, at] of seen) if (t - at > REPLAY_WINDOW_MS) seen.delete(sig);
    while (accepted.length && t - accepted[0]! > 60_000) accepted.shift();
    if (!secret || !headers.timestamp || !headers.signature) return 'unsigned';
    if (!/^\d{1,12}$/.test(headers.timestamp)) return 'bad_signature';
    if (!sameSignature(headers.signature, signature(secret, headers.timestamp, body))) return 'bad_signature';
    if (Math.abs(t - Number(headers.timestamp) * 1000) > REPLAY_WINDOW_MS) return 'stale';
    if (seen.has(headers.signature)) return 'replayed';
    if (accepted.length >= perMinute) return 'too_many';
    seen.set(headers.signature, t);
    accepted.push(t);
    return 'ok';
  };
}
