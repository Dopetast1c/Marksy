import type { TFunction } from 'i18next';
import { ApiFailure } from '../../api/client';

// What a failed sign-in, connect or invite says (docs/design.md 5.1, "Errors"): one sentence per API error code,
// about the diary when the diary refused, never a hint about which part of a Marksy login was wrong.

const KNOWN = new Set([
  'wrong_login',
  'diary_auth_failed',
  'diary_blocked',
  'needs_2fa',
  'already_connected',
  'login_taken',
  'diary_unavailable',
  'student_login_not_supported',
  'invite_gone',
  'signup_closed',
]);

export function errorText(t: TFunction, err: unknown): string {
  if (!(err instanceof ApiFailure)) return t('app.error');
  if (err.status === 429) return t('login.tooMany');
  const code = err.error?.code;
  if (code && KNOWN.has(code)) return t(`auth.error.${code}`);
  return t('app.error');
}
