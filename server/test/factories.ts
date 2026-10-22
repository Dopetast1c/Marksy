import { randomBytes } from 'node:crypto';
import type { Db } from '../src/db/client';
import { diaryAccounts, families } from '../src/db/schema';
import { encryptCredentials } from '../src/crypto/credentials';

// Fictional rows for tests. Nothing here resembles a real family.

export const TEST_CREDENTIALS_KEY = randomBytes(32);
export const DEMO_CREDENTIALS = { login: 'parent@example.com', password: 'demo' };

export async function createAccount(db: Db, providerId: string, over: Partial<typeof diaryAccounts.$inferInsert> = {}) {
  const [family] = await db.insert(families).values({ name: 'Example family' }).returning();
  const [account] = await db
    .insert(diaryAccounts)
    .values({
      familyId: family!.id,
      providerId,
      role: 'parent',
      label: DEMO_CREDENTIALS.login,
      credentialsEnc: encryptCredentials(DEMO_CREDENTIALS, family!.id, TEST_CREDENTIALS_KEY),
      ...over,
    })
    .returning();
  return { family: family!, account: account! };
}
