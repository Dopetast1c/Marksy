import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import type { AppDeps } from './http/context';
import { errorHandler, HttpError, notFound } from './http/errors';
import { createLimiters } from './http/rate-limit';
import { httpOnlyFromPrivate, securityHeaders } from './http/security';
import { loadSession } from './http/session';
import { appVersion } from './runtime/version';
import { openApiDocument, registry } from './openapi';
import { authRoutes } from './routes/auth';
import { familyRoutes } from './routes/family';
import { inviteRoutes } from './routes/invites';
import { avatarRoutes } from './routes/avatars';
import { wallpaperRoutes } from './routes/wallpaper';
import { lessonRoutes } from './routes/lessons';
import { scheduleRoutes } from './routes/schedule';
import { studentRoutes } from './routes/students';
import { subjectRoutes } from './routes/subjects';
import { syncRoutes } from './routes/sync';

// The Express app without listening, so Supertest can drive it in tests. Every route is described with Zod and appears
// in Swagger at /api/docs (docs/design.md 9); every route but login, invites, health and docs needs a session
// (http/route.ts), and connecting a diary signed out only where signing up is open (http/signup.ts).

const health = registry.register(
  'Health',
  z.object({ status: z.enum(['ok', 'unavailable']), version: z.string(), commit: z.string() }),
);
registry.registerPath({
  method: 'get',
  path: '/api/health',
  summary: 'Is the API up, with its database, and which version runs (nothing else: it answers signed out)',
  tags: ['system'],
  responses: {
    200: { description: 'The API and its database answer', content: { 'application/json': { schema: health } } },
    503: { description: 'The database does not answer', content: { 'application/json': { schema: health } } },
  },
});

/** Swagger UI is a page of its own: its scripts and styles come from this server, nothing from elsewhere */
const DOCS_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'";

export function createApp(deps: AppDeps) {
  const app = express();
  // the API sits behind the PWA's dev server or the reverse proxy: req.ip is the client's address and req.secure says
  // whether the request came over https, as far as the trusted proxy says (docs/running.md, two addresses)
  app.set('trust proxy', deps.trustProxy ?? 'loopback');
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(httpOnlyFromPrivate);
  app.use(express.json({ limit: '100kb' }));
  const version = deps.version ?? appVersion();
  app.get('/api/health', async (_req, res) => {
    const up = await deps.db.$client.query('select 1').then(
      () => true,
      () => false,
    );
    res.status(up ? 200 : 503).json(health.parse({ status: up ? 'ok' : 'unavailable', ...version }));
  });
  app.use(loadSession(deps));
  const limiters = createLimiters(() => (deps.now?.() ?? new Date()).getTime());
  app.use(authRoutes(deps, limiters));
  app.use(familyRoutes(deps, limiters));
  app.use(inviteRoutes(deps, limiters));
  app.use(studentRoutes(deps));
  app.use(subjectRoutes(deps));
  app.use(scheduleRoutes(deps));
  app.use(lessonRoutes(deps));
  app.use(avatarRoutes(deps));
  app.use(wallpaperRoutes(deps));
  app.use(syncRoutes(deps));

  // the document is built once, after every route registered itself; Swagger UI's assets are served from this
  // server (swagger-ui-dist), never from a CDN. In production it needs a session (API_DOCS), or is off.
  const docsMode = deps.apiDocs ?? 'open';
  if (docsMode !== 'off') {
    const doc = openApiDocument({ basePath: deps.basePath ?? '', version: version.version });
    const docsAccess: express.RequestHandler = (req, _res, next) => {
      if (docsMode === 'session' && !req.auth) return next(new HttpError(401, 'unauthorized', 'Sign in first'));
      next();
    };
    app.get('/api/openapi.json', docsAccess, (_req, res) => {
      res.json(doc);
    });
    const docsPolicy: express.RequestHandler = (_req, res, next) => {
      res.setHeader('Content-Security-Policy', DOCS_CSP);
      next();
    };
    app.use(
      '/api/docs',
      docsAccess,
      docsPolicy,
      swaggerUi.serve,
      swaggerUi.setup(doc, { customSiteTitle: 'Marksy API' }),
    );
  }
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
