import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../auth/password';
import { CredentialsKeyError, decryptCredentials, encryptCredentials, masterKey } from './credentials';

const master = randomBytes(32);
const creds = { login: 'parent@example.com', password: 'correct horse' };

describe('diary credentials at rest', () => {
  it('round-trips and never contains the plaintext', () => {
    const family = randomUUID();
    const blob = encryptCredentials(creds, family, master);
    expect(blob.toString('utf8')).not.toContain('correct horse');
    expect(decryptCredentials(blob, family, master)).toEqual(creds);
  });

  it('does not decrypt in another family or with another key', () => {
    const blob = encryptCredentials(creds, randomUUID(), master);
    expect(() => decryptCredentials(blob, randomUUID(), master)).toThrow();
    expect(() => decryptCredentials(blob, randomUUID(), randomBytes(32))).toThrow();
  });

  it('detects tampering', () => {
    const family = randomUUID();
    const blob = encryptCredentials(creds, family, master);
    blob[blob.length - 1]! ^= 1;
    expect(() => decryptCredentials(blob, family, master)).toThrow();
  });

  it('refuses a missing or short key without showing it', () => {
    expect(() => masterKey('')).toThrow(CredentialsKeyError);
    expect(() => masterKey(Buffer.from('short').toString('base64'))).toThrow(/32 bytes/);
  });
});

describe('passwords', () => {
  it('hashes with argon2id and verifies', async () => {
    const h = await hashPassword('demo-password');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'demo-password')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
    expect(await verifyPassword('not a hash', 'x')).toBe(false);
  });
});
