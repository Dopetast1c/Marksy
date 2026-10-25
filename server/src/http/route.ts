import express from 'express';
import type { Request, RequestHandler, Response, Router } from 'express';
import { z } from 'zod';
import type { ZodType } from 'zod';
import type { MemberRole } from '../family/rules';
import { apiError, registry } from '../openapi';
import { authOf, memberOf } from './context';
import { HttpError } from './errors';
import { SESSION_COOKIE } from './session';

// One declaration per route (docs/design.md 9): the Zod schemas validate the request, describe it in OpenAPI and
// type the handler; the access rule is part of the declaration, so no route forgets it. Every route needs a session
// unless it says `public`.

const session = registry.registerComponent('securitySchemes', 'session', {
  type: 'apiKey',
  in: 'cookie',
  name: SESSION_COOKIE,
});

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type ZodObjectLike = z.ZodObject<z.ZodRawShape>;

export interface RouteSpec<B extends ZodType, Q extends ZodObjectLike, P extends ZodObjectLike> {
  method: Method;
  /** Express form: /api/students/:id */
  path: string;
  summary: string;
  tags: string[];
  /** public: no session; member: a session in a family (any role, or the roles listed) */
  access: 'public' | 'session' | { roles: MemberRole[] } | 'member';
  body?: B;
  query?: Q;
  params?: P;
  /** The success status and its body (null: no body) */
  status?: 200 | 201 | 204;
  response: ZodType | null;
  /**
   * An uploaded picture (14.1): the body is the file's bytes, at most maxBytes, handed to the handler as a Buffer
   * (input.upload); what it is the handler decides from the bytes, never from the declared type
   */
  upload?: { maxBytes: number };
  /** Other answers worth naming in the docs */
  errors?: Partial<Record<400 | 401 | 403 | 404 | 409 | 410 | 429 | 503, string>>;
}

export interface Input<B extends ZodType, Q extends ZodObjectLike, P extends ZodObjectLike> {
  body: z.infer<B>;
  query: z.infer<Q>;
  params: z.infer<P>;
  /** the uploaded bytes of an upload route */
  upload: Buffer;
}

const openApiPath = (path: string) => path.replace(/:(\w+)/g, '{$1}');
/** Each route is described once, however many apps are created (tests create one per file) */
const described = new Set<string>();

export function route<
  B extends ZodType = z.ZodUndefined,
  Q extends ZodObjectLike = z.ZodObject<Record<string, never>>,
  P extends ZodObjectLike = z.ZodObject<Record<string, never>>,
>(
  router: Router,
  spec: RouteSpec<B, Q, P>,
  handler: (req: Request, input: Input<B, Q, P>, res: Response) => Promise<unknown>,
): void {
  const status = spec.status ?? 200;
  const errorResponses = Object.fromEntries(
    Object.entries({ 401: 'No session', ...spec.errors }).map(([code, description]) => [
      code,
      { description, content: { 'application/json': { schema: apiError } } },
    ]),
  );
  if (spec.access === 'public') delete errorResponses[401];
  const key = `${spec.method} ${spec.path}`;
  if (!described.has(key)) described.add(key);
  else return mount(router, spec, handler, status);
  registry.registerPath({
    method: spec.method,
    path: openApiPath(spec.path),
    summary: spec.summary,
    tags: spec.tags,
    ...(spec.access !== 'public' && { security: [{ [session.name]: [] }] }),
    request: {
      ...(spec.params && { params: spec.params }),
      ...(spec.query && { query: spec.query }),
      ...(spec.body && { body: { content: { 'application/json': { schema: spec.body } } } }),
      ...(spec.upload && {
        body: { content: { 'application/octet-stream': { schema: z.string().meta({ format: 'binary' }) } } },
      }),
    },
    responses: {
      [status]: spec.response
        ? { description: 'OK', content: { 'application/json': { schema: spec.response } } }
        : { description: 'Done' },
      ...errorResponses,
    },
  });

  mount(router, spec, handler, status);
}

/** The Express handler of a route: access, validation, the answer through the response schema */
function mount<B extends ZodType, Q extends ZodObjectLike, P extends ZodObjectLike>(
  router: Router,
  spec: RouteSpec<B, Q, P>,
  handler: (req: Request, input: Input<B, Q, P>, res: Response) => Promise<unknown>,
  status: number,
): void {
  const guard: RequestHandler = (req, _res, next) => {
    try {
      if (spec.access === 'session') authOf(req);
      if (spec.access === 'member') memberOf(req);
      if (typeof spec.access === 'object') {
        const m = memberOf(req);
        if (!spec.access.roles.includes(m.role)) throw new HttpError(403, 'forbidden', 'Your role does not allow this');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
  // an upload reads its bytes only after the access check, within its limit (413 above it)
  const raw: RequestHandler[] = spec.upload ? [express.raw({ type: () => true, limit: spec.upload.maxBytes })] : [];
  router[spec.method](spec.path, guard, ...raw, async (req, res, next) => {
    try {
      const input = {
        body: spec.body ? spec.body.parse(req.body) : undefined,
        query: spec.query ? spec.query.parse(req.query) : {},
        params: spec.params ? spec.params.parse(req.params) : {},
        upload: spec.upload && Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0),
      } as Input<B, Q, P>;
      const out = await handler(req, input, res);
      if (res.headersSent) return;
      if (status === 204 || spec.response === null) res.status(status).end();
      else res.status(status).json(spec.response.parse(out));
    } catch (err) {
      next(err);
    }
  });
}
