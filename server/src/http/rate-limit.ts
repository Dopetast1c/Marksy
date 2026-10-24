import { HttpError } from './errors';

// Attempts per IP and per login (docs/design.md 7.6), in memory (one process). An attempt is counted before it is
// checked, so many tries sent at once cannot all pass before the first failure is known; a success gives the attempt
// back. The same limiter guards Marksy logins and connecting a diary (every connect logs in to the diary).

const WINDOW_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;
/** Beyond this many keys, aged-out ones are swept on the next attempt */
const SWEEP_AT = 10_000;

export class LoginLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  private keys(ip: string, login: string) {
    return [`ip:${ip}`, `login:${login.trim().toLowerCase()}`];
  }

  private recent(key: string): number[] {
    const since = this.now() - WINDOW_MS;
    const list = (this.attempts.get(key) ?? []).filter((t) => t > since);
    if (list.length) this.attempts.set(key, list);
    else this.attempts.delete(key);
    return list;
  }

  /**
   * Takes one attempt: 0 when it may go ahead (and is counted), or the seconds until one is allowed again (and
   * nothing is counted)
   */
  take(ip: string, login: string): number {
    if (this.attempts.size > SWEEP_AT) for (const key of [...this.attempts.keys()]) this.recent(key);
    const keys = this.keys(ip, login);
    const waits = keys
      .map((k) => this.recent(k))
      .filter((l) => l.length >= MAX_ATTEMPTS)
      .map((l) => Math.ceil((l[0]! + WINDOW_MS - this.now()) / 1000));
    if (waits.length) return Math.max(...waits);
    for (const key of keys) this.attempts.set(key, [...this.recent(key), this.now()]);
    return 0;
  }

  /** The attempt went through: it does not count against the login, nor against the address */
  succeed(ip: string, login: string): void {
    const [ipKey, loginKey] = this.keys(ip, login);
    this.attempts.delete(loginKey!);
    const list = this.recent(ipKey!);
    list.pop();
    if (list.length) this.attempts.set(ipKey!, list);
    else this.attempts.delete(ipKey!);
  }
}

/** Runs one attempt under a limiter: refused with 429 when there were too many, given back when it succeeds */
export async function underLimit<T>(
  limiter: LoginLimiter,
  ip: string,
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const wait = limiter.take(ip, key);
  if (wait) throw new HttpError(429, 'too_many_tries', 'Too many tries; wait a little', { retryAfter: wait });
  const result = await work();
  limiter.succeed(ip, key);
  return result;
}

/** The limiters of one app: Marksy logins, connecting a diary (each one is a diary login), invite codes */
export interface Limiters {
  login: LoginLimiter;
  connect: LoginLimiter;
  invite: LoginLimiter;
}

export function createLimiters(now: () => number): Limiters {
  return { login: new LoginLimiter(now), connect: new LoginLimiter(now), invite: new LoginLimiter(now) };
}
