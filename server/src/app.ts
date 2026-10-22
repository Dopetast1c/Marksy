import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { openApiDocument, registry } from './openapi';

// The Express app without listening, so Supertest can drive it in tests. Routes and middleware arrive by milestone
// (docs/build-plan.md); every route is described with Zod and appears in Swagger at /api/docs (docs/design.md 9).

const health = registry.register('Health', z.object({ status: z.literal('ok') }));
registry.registerPath({
  method: 'get',
  path: '/api/health',
  summary: 'Is the API up',
  tags: ['system'],
  responses: { 200: { description: 'The API answers', content: { 'application/json': { schema: health } } } },
});

export function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_req, res) => {
    res.json(health.parse({ status: 'ok' }));
  });

  // the document is built once, after every route registered itself; Swagger UI's assets are served from this
  // server (swagger-ui-dist), never from a CDN
  const doc = openApiDocument();
  app.get('/api/openapi.json', (_req, res) => {
    res.json(doc);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(doc, { customSiteTitle: 'Marksy API' }));
  return app;
}
