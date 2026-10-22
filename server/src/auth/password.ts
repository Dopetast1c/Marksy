import { hash, verify } from '@node-rs/argon2';

// Marksy passwords: argon2id with the library's defaults (docs/design.md 7). Login and sessions arrive with M4; the
// seed needs the hash for its demo logins already.

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}
