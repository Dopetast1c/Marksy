import { createServer, request } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { decide, filterImageList } from './guard-rules';
import type { GuardLookup } from './guard-rules';
import { log } from './log';

// The socket guard (docs/running.md, updates): a small HTTP proxy in front of the Docker socket, on a network only
// the updater shares. Each request is checked against guard-rules.ts before it reaches Docker; a refusal is a 403
// that names the rule, never the request's contents.

const BODY_LIMIT = 1_000_000;

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new Error('too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** One request to the Docker socket, its whole JSON answer or null on 404 */
function dockerJson(socketPath: string, path: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const r = request({ socketPath, path, method: 'GET' }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode === 404) return resolve(null);
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (err) {
          reject(err instanceof Error ? err : new Error('invalid answer'));
        }
      });
    });
    r.on('error', reject);
    r.end();
  });
}

export function socketLookup(socketPath: string): GuardLookup {
  return {
    async containerLabels(id) {
      const c = (await dockerJson(socketPath, `/containers/${encodeURIComponent(id)}/json`)) as {
        Config?: { Labels?: Record<string, string> };
      } | null;
      return c ? (c.Config?.Labels ?? {}) : null;
    },
    async imageNames(id) {
      const i = (await dockerJson(socketPath, `/images/${encodeURIComponent(id)}/json`)) as {
        RepoTags?: string[];
        RepoDigests?: string[];
      } | null;
      return i ? [...(i.RepoTags ?? []), ...(i.RepoDigests ?? [])].filter((n) => !n.startsWith('<none>')) : null;
    },
    async networkLabels(id) {
      const n = (await dockerJson(socketPath, `/networks/${encodeURIComponent(id)}`)) as {
        Labels?: Record<string, string>;
      } | null;
      return n ? (n.Labels ?? {}) : null;
    },
  };
}

export function startGuard(opts: { socketPath: string; port: number; prefix: string; lookup?: GuardLookup }) {
  const lookup = opts.lookup ?? socketLookup(opts.socketPath);
  const server = createServer((req, res) => {
    const refuse = (status: number, reason: string) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: `refused by the Marksy socket guard: ${reason}` }));
    };
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://guard');
      const raw = await readBody(req);
      let body: unknown;
      if (raw.length) {
        try {
          body = JSON.parse(raw.toString('utf8'));
        } catch {
          return refuse(400, 'body');
        }
      }
      const method = req.method ?? 'GET';
      const decision = await decide({ method, path: url.pathname, query: url.searchParams, body }, lookup, opts.prefix);
      if (!decision.allow) {
        log.warn('refused', { method, rule: decision.reason });
        return refuse(403, decision.reason);
      }
      const query = (decision.query ?? url.searchParams).toString();
      const headers = { ...req.headers, host: 'docker' };
      delete headers.connection;
      delete headers.upgrade;
      if (raw.length) headers['content-length'] = String(raw.length);
      const upstream = request(
        { socketPath: opts.socketPath, method, path: `${url.pathname}${query ? `?${query}` : ''}`, headers },
        (answer) => {
          if (!decision.filterImages) {
            res.writeHead(answer.statusCode ?? 502, answer.headers);
            answer.pipe(res);
            return;
          }
          const chunks: Buffer[] = [];
          answer.on('data', (c: Buffer) => chunks.push(c));
          answer.on('end', () => {
            let list: unknown = [];
            try {
              list = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              // an answer that is not a list becomes an empty one
            }
            res.writeHead(answer.statusCode ?? 502, { 'content-type': 'application/json' });
            res.end(JSON.stringify(filterImageList(list, opts.prefix)));
          });
        },
      );
      upstream.on('error', () => {
        if (!res.headersSent) refuse(502, 'docker unavailable');
        else res.destroy();
      });
      upstream.end(raw.length ? raw : undefined);
    })().catch(() => {
      if (!res.headersSent) refuse(500, 'guard error');
    });
  });
  server.listen(opts.port, '0.0.0.0', () => log.info('socket guard on', { port: opts.port }));
  return server;
}
