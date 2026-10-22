import { demoFullTransport, getProvider } from '@marksy/registry';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { TEST_CREDENTIALS_KEY } from '../../test/factories';
import { diaryAccounts, families } from '../db/schema';
import { readSyncConfig } from './config';
import { formatReport, syncOnce } from './once';

const db = testDb();
const provider = getProvider('demo-full')!;
const at = (local: string) => new Date(`${local.replace(' ', 'T')}:00+03:00`);

const once = (nowLocal: string, password = 'demo', transport = demoFullTransport()) =>
  syncOnce({
    db,
    provider,
    login: 'parent@example.com',
    password,
    credentialsKey: TEST_CREDENTIALS_KEY,
    config: readSyncConfig({}),
    now: () => at(nowLocal),
    transport,
    sleep: async () => undefined,
    online: async () => true,
  });

describe('pnpm sync:once', () => {
  beforeEach(() => resetDb(db));

  it('creates a minimal family on first use, then reuses it', async () => {
    const first = await once('2025-09-17 10:00');
    expect(first).toMatchObject({ created: true, students: 2, result: { outcome: 'ran', status: 'success' } });
    const second = await once('2025-09-17 11:30');
    expect(second).toMatchObject({ created: false, credentialsChanged: false });
    expect(await db.select().from(families)).toHaveLength(1);
    expect(await db.select().from(diaryAccounts)).toHaveLength(1);
  });

  it('respects the login interval like any other run', async () => {
    await once('2025-09-17 10:00');
    const r = await once('2025-09-17 10:20');
    expect(r.result).toMatchObject({ outcome: 'skipped', decision: { reason: 'interval' } });
    expect(formatReport(r).at(-1)).toMatch(/^not run: interval, next allowed at /);
  });

  it('a new password in .env lets an account that needed action try again', async () => {
    const refused = async () => ({ status: 401, headers: {}, text: '{}' });
    await once('2025-09-17 10:00', 'demo', refused);
    expect((await db.select().from(diaryAccounts))[0]).toMatchObject({ requiresAction: 'auth' });
    expect((await once('2025-09-17 12:00')).result).toMatchObject({ decision: { reason: 'requires_action' } });
    const fixed = await once('2025-09-17 12:00', 'new-demo');
    expect(fixed).toMatchObject({ credentialsChanged: true, result: { outcome: 'ran', status: 'success' } });
  });

  it('reports counts and statuses, no names', async () => {
    const lines = formatReport(await once('2025-09-17 10:00')).join('\n');
    expect(lines).toContain('students: 2');
    expect(lines).not.toMatch(/Ученик|Пример|parent@example\.com/);
  });
});
