import { isIPv4, isIPv6 } from 'node:net';

// Where the app is served and who may reach it over plain http (docs/running.md, "Two addresses"). The same instance
// answers on the home network over http and through the tunnel over https; the proxy in front of it says which one a
// request came by, and it is believed only because the server trusts nothing but that proxy (TRUST_PROXY).

/**
 * BASE_PATH as one form: "" for the root, "/marksy" for a path (leading slash, no trailing one). Anything that is not a
 * plain path of letters, digits, dots, dashes and underscores is refused, so it can go into a cookie and a page as is.
 */
export function normalizeBasePath(value: string | undefined): string {
  const raw = (value ?? '').trim();
  if (raw === '' || raw === '/') return '';
  const path = `/${raw.replace(/^\/+|\/+$/g, '')}`;
  if (!/^(\/[A-Za-z0-9._-]+)+$/.test(path))
    throw new Error(`BASE_PATH must be a plain path such as /marksy, not ${raw}`);
  return path;
}

/** The Path of the session cookie: the app's own path, so other services on the same host never receive it */
export const cookiePath = (basePath: string) => basePath || '/';

const v4 = (ip: string) => ip.split('.').map(Number) as [number, number, number, number];

/**
 * Loopback, private, link-local and unique-local addresses (RFC 1918, RFC 4193): the home network and the containers.
 * Shared address space (100.64.0.0/10) is not private: a carrier's customers share it.
 */
export function isPrivateAddress(address: string | undefined): boolean {
  if (!address) return false;
  const ip = address.startsWith('::ffff:') && isIPv4(address.slice(7)) ? address.slice(7) : address;
  if (isIPv4(ip)) {
    const [a, b] = v4(ip);
    return (
      a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
    );
  }
  if (isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === '::1' || /^f[cd][0-9a-f]{2}:/.test(lower) || /^fe[89ab][0-9a-f]:/.test(lower);
  }
  return false;
}
