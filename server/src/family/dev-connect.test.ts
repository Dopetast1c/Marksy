import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { TEST_CREDENTIALS_KEY } from '../../test/factories';
import { cliLogins, families } from '../db/schema';
import { readSyncConfig } from '../sync/config';
import { devConnect } from './dev-connect';
import type { DevConnectInput } from './dev-connect';

const db = testDb();

describe('pnpm dev:connect', () => {
  beforeEach(() => resetDb(db));

  it('a diary login refused once is not tried again by Claude Code, in development too', async () => {
    let logins = 0;
    const input: DevConnectInput = {
      providerId: 'demo-full',
      diary: { login: 'refused-user', password: 'x' },
      marksy: { login: 'owner@example.com', password: 'correct horse battery' },
      runner: 'claude',
      credentialsKey: TEST_CREDENTIALS_KEY,
      allowDemoProviders: true,
      syncConfig: readSyncConfig({}),
      env: { MARKSY_ENV: 'development' },
      transport: async () => {
        logins++;
        return { status: 401, headers: {}, text: '{}' };
      },
    };
    await expect(devConnect(db, input)).rejects.toMatchObject({ code: 'diary_auth_failed' });
    expect((await db.select().from(cliLogins)).map((r) => r.outcome)).toEqual(['auth']);
    // an hour later, past the development interval: still refused, without a diary login
    const later = await devConnect(db, { ...input, now: () => new Date(Date.now() + 3_600_000) });
    expect(later).toMatchObject({ outcome: 'refused', message: expect.stringMatching(/only the owner/) });
    expect(logins).toBe(1);
    expect(await db.select().from(families)).toHaveLength(0);
  });
});
