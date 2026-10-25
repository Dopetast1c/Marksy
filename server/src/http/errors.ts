import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { errorSummary, log } from '../log';

// Errors everywhere: { error: { code, message, details? } } (docs/design.md 9). A message never repeats what the
// request carried (a login, a password, a diary's answer): validation errors name the field, not the value.

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound: RequestHandler = (_req, _res, next) => next(new HttpError(404, 'not_found', 'No such route'));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details !== undefined && { details: err.details }) },
    });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'invalid_request',
        message: 'The request does not match the API',
        details: err.issues.map((i) => ({ path: i.path.join('.'), code: i.code })),
      },
    });
    return;
  }
  // express.json() on a body that is not JSON
  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'invalid_json', message: 'The body is not JSON' } });
    return;
  }
  // a body over its limit: the JSON limit, or an upload's (14.1)
  if ((err as { type?: string }).type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'too_large', message: 'The body is larger than this route accepts' } });
    return;
  }
  log.error('api error', { error: errorSummary(err) });
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
};
