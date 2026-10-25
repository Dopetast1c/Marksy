import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// Diary credentials at rest (docs/design.md 14.1, CLAUDE.md "Hard rules"): AES-256-GCM with a key per family, derived
// with HKDF from CREDENTIALS_KEY and the family id, so a database dump does not open every diary login at once and a
// row copied into another family does not decrypt. Plaintext never leaves this module except to provider.login().

const VERSION = 1;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const INFO = Buffer.from('marksy diary credentials v1');

export class CredentialsKeyError extends Error {}

/** CREDENTIALS_KEY as 32 bytes; throws with a hint when it is missing or malformed (the value itself is never shown). */
export function masterKey(value = process.env.CREDENTIALS_KEY): Buffer {
  if (!value) throw new CredentialsKeyError('CREDENTIALS_KEY is not set (env.example: openssl rand -base64 32)');
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new CredentialsKeyError('CREDENTIALS_KEY must be 32 bytes, base64');
  return key;
}

function familyKey(master: Buffer, familyId: string): Buffer {
  return Buffer.from(hkdfSync('sha256', master, Buffer.from(familyId, 'utf8'), INFO, 32));
}

export function encryptCredentials(
  credentials: Record<string, string>,
  familyId: string,
  master = masterKey(),
): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', familyKey(master, familyId), iv);
  cipher.setAAD(Buffer.from(familyId, 'utf8'));
  const body = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
}

export function decryptCredentials(blob: Buffer, familyId: string, master = masterKey()): Record<string, string> {
  if (blob[0] !== VERSION) throw new CredentialsKeyError('Unknown credentials format');
  const iv = blob.subarray(1, 1 + IV_BYTES);
  const tag = blob.subarray(1 + IV_BYTES, 1 + IV_BYTES + TAG_BYTES);
  const decipher = createDecipheriv('aes-256-gcm', familyKey(master, familyId), iv);
  decipher.setAAD(Buffer.from(familyId, 'utf8'));
  decipher.setAuthTag(tag);
  const text = Buffer.concat([decipher.update(blob.subarray(1 + IV_BYTES + TAG_BYTES)), decipher.final()]);
  return JSON.parse(text.toString('utf8')) as Record<string, string>;
}
