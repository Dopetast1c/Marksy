import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, gt } from 'drizzle-orm';
import type { Request, RequestHandler, Response } from 'express';
import type { Db } from '../db/client';
import { memberships, sessions } from '../db/schema';
import type { AppDeps, Auth } from './context';

// Sessions (docs/design.md 7.2 step 5, build-plan M3 notes): an httpOnly, SameSite=Lax cookie with a random token,
// Secure only behind https; the database keeps only the token's SHA-256. 30 days, sliding: a session used again after
// a day gets its 30 days back. No JWT for a first-party PWA.

export const SESSION_COOKIE = 'marksy_session';
const TTL_MS = 30 * 86_400_000;
const SLIDE_AFTER_MS = 86_400_000;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return undefined;
}

/** Max-Age, not Expires: the browser counts the 30 days on its own clock, whatever this server's clock says */
function setCookie(res: Response, token: string, secure: boolean) {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, maxAge: TTL_MS, path: '/' });
}

/** Signs a person in: a new session in their current family, and the cookie */
export async function startSession(
  deps: AppDeps,
  res: Response,
  who: { userId: string; familyId: string | null; userAgent?: string | undefined },
): Promise<void> {
  const now = deps.now?.() ?? new Date();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + TTL_MS);
  await deps.db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId: who.userId,
    familyId: who.familyId,
    expiresAt,
    createdAt: now,
    userAgent: who.userAgent?.slice(0, 200) ?? null,
  });
  setCookie(res, token, deps.secureCookies);
}

/** Signs this browser out: the session row goes, the cookie is cleared */
export async function endSession(deps: AppDeps, req: Request, res: Response): Promise<void> {
  if (req.auth) await deps.db.delete(sessions).where(eq(sessions.id, req.auth.sessionId));
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure: deps.secureCookies, path: '/' });
}

/** The role of a person in a family, or their first family when the session has none (or lost it) */
export async function currentMembership(
  db: Db,
  userId: string,
  familyId: string | null,
): Promise<Pick<Auth, 'familyId' | 'role'>> {
  const rows = await db
    .select({ familyId: memberships.familyId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt));
  const m = rows.find((r) => r.familyId === familyId) ?? rows[0];
  return m ? { familyId: m.familyId, role: m.role } : { familyId: null, role: null };
}

/** Reads the cookie on every request: req.auth for a live session, nothing otherwise */
export function loadSession(deps: AppDeps): RequestHandler {
  return async (req, res, next) => {
    try {
      const token = readCookie(req, SESSION_COOKIE);
      if (!token) return next();
      const now = deps.now?.() ?? new Date();
      const [row] = await deps.db
        .select()
        .from(sessions)
        .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)));
      if (!row) return next();
      const membership = await currentMembership(deps.db, row.userId, row.familyId);
      if (membership.familyId !== row.familyId)
        await deps.db.update(sessions).set({ familyId: membership.familyId }).where(eq(sessions.id, row.id));
      if (row.expiresAt.getTime() - now.getTime() < TTL_MS - SLIDE_AFTER_MS) {
        const expiresAt = new Date(now.getTime() + TTL_MS);
        await deps.db.update(sessions).set({ expiresAt }).where(eq(sessions.id, row.id));
        setCookie(res, token, deps.secureCookies);
      }
      req.auth = { sessionId: row.id, userId: row.userId, ...membership };
      next();
    } catch (err) {
      next(err);
    }
  };
}
