import { hash, verify } from '@node-rs/argon2';
import type { Algorithm } from '@node-rs/argon2';

// Marksy passwords (docs/design.md 7): argon2id at the OWASP minimum for argon2id, 19 MiB of memory, two passes, one
// lane. Named here, not left to the library's defaults, so a new version of the library cannot change them unseen.
// The cost is what keeps a login under about two seconds on a Raspberry Pi 3B (docs/running.md); a stored hash names
// its own parameters, so raising them later still verifies the old ones.

/** Algorithm.Argon2id is 2 (an ambient const enum, which this build cannot read as a value) */
const ARGON2ID = 2 as Algorithm;

export const ARGON2 = { algorithm: ARGON2ID, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}
