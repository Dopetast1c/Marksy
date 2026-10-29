import type { RequestHandler } from 'express';
import { isPrivateAddress } from '../runtime/network';
import { HttpError } from './errors';

// What every API answer carries (docs/running.md, security checklist). The API sends JSON and pictures, never a page,
// so its policy allows nothing to run; the web app's own policy is set by the web server (docker/web/Caddyfile).

export const API_SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export const securityHeaders: RequestHandler = (_req, res, next) => {
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) res.setHeader(name, value);
  next();
};

/**
 * Plain http only from the home network: a request that reached the server over http from a public address means a
 * port was forwarded to the internet by mistake, and a login form must never travel over it. https (the tunnel, as the
 * trusted proxy says) is fine from anywhere.
 */
export const httpOnlyFromPrivate: RequestHandler = (req, _res, next) => {
  if (req.secure || isPrivateAddress(req.ip)) return next();
  next(new HttpError(403, 'https_required', 'Use the https address of this Marksy'));
};
