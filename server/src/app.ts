import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import type { AppDeps } from './http/context';
import { errorHandler, notFound } from './http/errors';
import { createLimiters } from './http/rate-limit';
import { loadSession } from './http/session';
import { openApiDocument, registry } from './openapi';
import { authRoutes } from './routes/auth';
import { familyRoutes } from './routes/family';
import { inviteRoutes } from './routes/invites';
import { scheduleRoutes } from './routes/schedule';
import { studentRoutes } from './routes/students';
import { subjectRoutes } from './routes/subjects';
import { syncRoutes } from './routes/sync';

// The Express app without listening, so Supertest can drive it in tests. Every route is described with Zod and appears
// in Swagger at /api/docs (docs/design.md 9); every route but login, connect, invites, providers, health and docs
// needs a session (http/route.ts).

const health = registry.register('Health', z.object({ status: z.literal('ok') }));
registry.registerPath({
  method: 'get',
  path: '/api/health',
  summary: 'Is the API up',
  tags: ['system'],
  responses: { 200: { description: 'The API answers', content: { 'application/json': { schema: health } } } },
});

export function createApp(deps: AppDeps) {
  const app = express();
  // the API sits behind the PWA's dev server or a reverse proxy on this machine: req.ip is the client's address
  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.get('/api/health', (_req, res) => {
    res.json(health.parse({ status: 'ok' }));
  });
  app.use(loadSession(deps));
  const limiters = createLimiters(() => (deps.now?.() ?? new Date()).getTime());
  app.use(authRoutes(deps, limiters));
  app.use(familyRoutes(deps, limiters));
  app.use(inviteRoutes(deps, limiters));
  app.use(studentRoutes(deps));
  app.use(subjectRoutes(deps));
  app.use(scheduleRoutes(deps));
  app.use(syncRoutes(deps));

  // the document is built once, after every route registered itself; Swagger UI's assets are served from this
  // server (swagger-ui-dist), never from a CDN
  const doc = openApiDocument();
  app.get('/api/openapi.json', (_req, res) => {
    res.json(doc);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(doc, { customSiteTitle: 'Marksy API' }));
  app.use('/api', notFound);
  app.use(errorHandler);
  return app;
}
