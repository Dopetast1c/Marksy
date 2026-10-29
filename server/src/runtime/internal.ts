import { createHash, timingSafeEqual } from 'node:crypto';
import express from 'express';
import type { Db } from '../db/client';
import { holdSync } from './instance';
import { instanceStatus } from './status';

// The internal port (INTERNAL_PORT, docs/running.md): the status the command and the updater read, and the hold the
// updater takes so that no collector run starts while it replaces the server. It is never routed by the proxy, and
// every request carries MARKSY_INTERNAL_TOKEN, so another container on the network cannot use it either.

/** The longest hold one call may take: an update that takes longer has failed anyway */
const MAX_HOLD_MINUTES = 30;

const digest = (s: string) => createHash('sha256').update(s).digest();

export function createInternalApp(deps: { db: Db; token: string; syncEnv: boolean; now?: () => Date }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1kb' }));
  const expected = digest(`Bearer ${deps.token}`);
  app.use((req, res, next) => {
    if (timingSafeEqual(digest(req.get('authorization') ?? ''), expected)) return next();
    res.status(401).json({ error: { code: 'unauthorized', message: 'Token required' } });
  });
  const now = () => deps.now?.() ?? new Date();

  app.get('/internal/status', async (_req, res, next) => {
    try {
      res.json(await instanceStatus(deps.db, { syncEnv: deps.syncEnv, now: now() }));
    } catch (err) {
      next(err);
    }
  });
  // { minutes }: no run starts until then; 0 ends the hold
  app.post('/internal/hold', (req, res) => {
    const minutes = Math.min(
      MAX_HOLD_MINUTES,
      Math.max(0, Number((req.body as { minutes?: unknown })?.minutes ?? 0) || 0),
    );
    holdSync(minutes ? now().getTime() + minutes * 60_000 : 0);
    res.json({ heldUntil: minutes ? new Date(now().getTime() + minutes * 60_000).toISOString() : null });
  });
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found', message: 'No such route' } });
  });
  return app;
}
