import { matchPath } from './allow-list';
import type { Transport, TransportRequest, TransportResponse } from './throttled-client';

// A transport that answers from fixtures instead of the network: for the conformance suite, collector tests and
// providers/demo-minimal. Routes are "METHOD /path/pattern" -> fixture name; anything else is a 404.

export interface FixtureTransportOptions {
  fixtures: Readonly<Record<string, unknown>>;
  routes: Readonly<Record<string, string>>;
  /** Transform each fixture before it is served (the conformance suite adds unknown fields) */
  mutate?: (value: unknown) => unknown;
  /** Every request served, for assertions */
  log?: TransportRequest[];
}

export function createFixtureTransport(opts: FixtureTransportOptions): Transport {
  const routes = Object.entries(opts.routes).map(([route, name]) => {
    const [method, pattern] = route.split(' ');
    return { method, pattern: pattern!, name };
  });
  return async (req): Promise<TransportResponse> => {
    opts.log?.push(req);
    const { pathname } = new URL(req.url);
    const route = routes.find((r) => r.method === req.method && matchPath(r.pattern, pathname));
    if (!route || !(route.name in opts.fixtures)) return { status: 404, headers: {}, text: '{"error":"not found"}' };
    const body = opts.mutate ? opts.mutate(opts.fixtures[route.name]) : opts.fixtures[route.name];
    return { status: 200, headers: { 'content-type': 'application/json' }, text: JSON.stringify(body) };
  };
}

/** Adds an unknown key to every object, recursively: the mapper must not care. */
export function addUnknownFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(addUnknownFields);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = { zzUnknownField: { nested: [1, 'x'] } };
    for (const [k, v] of Object.entries(value)) out[k] = addUnknownFields(v);
    return out;
  }
  return value;
}
