import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('passwords', () => {
  it('argon2id at the OWASP minimum: 19 MiB, two passes, one lane', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(stored, 'correct horse battery')).toBe(true);
    expect(await verifyPassword(stored, 'wrong horse battery')).toBe(false);
    expect(await verifyPassword('not a hash', 'x')).toBe(false);
  });
});
