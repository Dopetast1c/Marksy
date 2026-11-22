import { demoFullTransport, getProvider } from '@marksy/registry';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { createAccount, DEMO_CREDENTIALS } from '../../test/factories';
import { marks, students, subjects, syncRuns } from '../db/schema';
import { runCollector } from '../sync/collector';
import { diagMarks } from './diag';

// `marksy diag marks`: counts, dates, id prefixes and API words only, never a name, a mark or a subject

const db = testDb();
const NOW = new Date('2025-09-19T09:00:00Z');

describe('diag marks', () => {
  beforeEach(() => resetDb(db));

  it('prints every section as counts, with nothing personal in it', async () => {
    const { account } = await createAccount(db, 'demo-full');
    const [run] = await db
      .insert(syncRuns)
      .values({
        familyId: account.familyId,
        diaryAccountId: account.id,
        providerId: 'demo-full',
        kind: 'manual',
        trigger: 'user:u-secret-77',
        startedAt: NOW,
        status: 'running',
      })
      .returning();
    await runCollector({
      db,
      provider: getProvider('demo-full')!,
      account,
      credentials: DEMO_CREDENTIALS,
      runId: run!.id,
      plan: () => [{ weekStart: '2025-09-08', set: 'standing' }],
      transport: demoFullTransport(),
      sleep: async () => undefined,
      now: () => NOW,
    });
    const lines: string[] = [];
    await diagMarks(db, (l) => lines.push(l));
    const text = lines.join('\n');
    expect(text).toContain('Marks per child and term');
    expect(text).toContain('quarter 1');
    expect(text).toContain('Background jobs');
    for (const s of await db.select().from(students)) expect(text).not.toContain(s.fullName);
    for (const s of await db.select().from(subjects)) expect(text).not.toContain(s.name);
    for (const m of await db.select().from(marks)) if (m.comment) expect(text).not.toContain(m.comment);
    expect(text).not.toContain('u-secret-77');
  });
});
