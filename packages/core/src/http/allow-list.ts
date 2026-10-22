import type { HttpMethod } from './types';

// readOnlyAllowList entries: "GET /education/diary/**". * matches one path segment, ** any number (also none).
// Matching ignores the query string; the host is checked separately (only manifest.network.baseUrl is allowed).
// A path that could mean something else to the server than to this matcher (encoded slashes or dots, empty or dot
// segments, broken escapes) never matches: an allowed prefix must not reach a forbidden endpoint.

interface Rule {
  method: string;
  segments: string[];
}

function compile(entry: string): Rule {
  const [method, path] = entry.split(' ');
  return { method: method!, segments: path!.split('/').filter(Boolean) };
}

function matchSegments(pattern: readonly string[], path: readonly string[]): boolean {
  if (!pattern.length) return !path.length;
  const [head, ...rest] = pattern;
  if (head === '**') return path.some((_, i) => matchSegments(rest, path.slice(i))) || matchSegments(rest, []);
  if (!path.length) return false;
  return (head === '*' || head === path[0]) && matchSegments(rest, path.slice(1));
}

/**
 * What a decoded segment may contain: ids, numbers, words, dates. No "/", "\", ";" (Java servers read "..;" as ".."),
 * "%" (double encoding), spaces or control characters.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9._~@:+=,-]+$/;

/** The path's segments, decoded, or null when the path is ambiguous and must be refused. */
export function safeSegments(path: string): string[] | null {
  const pathname = path.split('?')[0]!;
  if (!pathname.startsWith('/')) return null;
  // one trailing slash is fine ("/diary/"); any other empty segment ("//") is not
  const raw = pathname.slice(1).replace(/\/$/, '');
  if (raw === '') return [];
  const out: string[] = [];
  for (const segment of raw.split('/')) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      return null;
    }
    if (!SAFE_SEGMENT.test(decoded) || decoded === '.' || decoded === '..') return null;
    out.push(decoded);
  }
  return out;
}

// Does a path match one pattern, e.g. "/children/*/grades" or "/diary/**"? The query string is ignored.
export function matchPath(pattern: string, path: string): boolean {
  const segments = safeSegments(path);
  return segments !== null && matchSegments(pattern.split('/').filter(Boolean), segments);
}

/**
 * Is this request the login? Any method on a path matching the login pattern counts, and case is ignored:
 * counting too many logins is the safe direction, retrying one is not.
 */
export function createLoginMatcher(loginRequest: string | null): (path: string) => boolean {
  if (!loginRequest) return () => false;
  const pattern = loginRequest.split(' ')[1]!.toLowerCase();
  return (path) => matchPath(pattern, path.toLowerCase());
}

export function createAllowList(entries: readonly string[]): (method: HttpMethod, path: string) => boolean {
  const rules = entries.map(compile);
  return (method, path) => {
    const segments = safeSegments(path);
    return segments !== null && rules.some((r) => r.method === method && matchSegments(r.segments, segments));
  };
}
