import type { Request } from 'express';
import type { AppDeps } from './context';
import { families } from '../db/schema';
import { HttpError } from './errors';

// Connecting a diary without a session creates a family (docs/design.md 7.2). A home instance reached through the
// tunnel must not let a stranger do that, so outside development only the first family is created this way (SIGNUP,
// docs/running.md); everyone after it joins by invite, or is added from Family (family.title) by a signed-in member.

/** Refuses a signed-out request when sign-up is closed: always under SIGNUP=closed, once a family exists under first */
export async function assertSignupOpen(deps: AppDeps, req: Request): Promise<void> {
  if (req.auth) return;
  const mode = deps.signup ?? 'open';
  if (mode === 'open') return;
  if (mode === 'first') {
    const [any] = await deps.db.select({ id: families.id }).from(families).limit(1);
    if (!any) return;
  }
  throw new HttpError(403, 'signup_closed', 'This Marksy is set up already: ask a family member for an invite');
}
