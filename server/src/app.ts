import express from 'express';

// The Express app without listening, so Supertest can drive it in tests. Routes and middleware arrive by milestone
// (docs/build-plan.md); every route is described with Zod and appears in Swagger at /api/docs (docs/design.md 9).
export function createApp() {
  const app = express();
  app.use(express.json());
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  return app;
}
