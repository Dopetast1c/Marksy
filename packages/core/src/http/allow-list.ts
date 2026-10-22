import type { HttpMethod } from './types';

// readOnlyAllowList entries: "GET /education/diary/**". * matches one path segment, ** any number (also none).
// Matching ignores the query string; the host is checked separately (only manifest.network.baseUrl is allowed).

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

export function createAllowList(entries: readonly string[]): (method: HttpMethod, path: string) => boolean {
  const rules = entries.map(compile);
  return (method, path) => {
    const segments = path.split('?')[0]!.split('/').filter(Boolean).map(decodeURIComponent);
    // ".." would let an allowed prefix reach anywhere on the host
    if (segments.some((s) => s === '..' || s === '.')) return false;
    return rules.some((r) => r.method === method && matchSegments(r.segments, segments));
  };
}
