// Login attempts (docs/design.md 7.6): 5 failed tries per 15 minutes per IP and per login, in memory (one process).
// A success clears the login's count; the IP's count only ages out, so one address cannot try many logins.

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 5;

export class LoginLimiter {
  private readonly failures = new Map<string, number[]>();

  constructor(private readonly now: () => number = Date.now) {}

  private recent(key: string): number[] {
    const since = this.now() - WINDOW_MS;
    const list = (this.failures.get(key) ?? []).filter((t) => t > since);
    if (list.length) this.failures.set(key, list);
    else this.failures.delete(key);
    return list;
  }

  /** Seconds until a try is allowed again, or 0 when it is allowed now */
  retryAfter(ip: string, login: string): number {
    const keys = [`ip:${ip}`, `login:${login.trim().toLowerCase()}`];
    const waits = keys
      .map((k) => this.recent(k))
      .filter((l) => l.length >= MAX_FAILURES)
      .map((l) => Math.ceil((l[0]! + WINDOW_MS - this.now()) / 1000));
    return waits.length ? Math.max(...waits) : 0;
  }

  fail(ip: string, login: string): void {
    for (const key of [`ip:${ip}`, `login:${login.trim().toLowerCase()}`]) {
      this.failures.set(key, [...this.recent(key), this.now()]);
    }
  }

  succeed(login: string): void {
    this.failures.delete(`login:${login.trim().toLowerCase()}`);
  }
}
