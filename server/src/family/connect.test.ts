import type { TransportRequest } from '@marksy/core';
import { demoFullTransport } from '@marksy/registry';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, testApp } from '../../test/app';
import { CONSENT } from '../../test/connect';
import { resetDb, testDb } from '../../test/db';
import { diaryAccounts, lessons, rawResponses, syncCoverage, syncRuns } from '../db/schema';

const db = testDb();
// a school day of the fictional diary's year (demo-full has its weeks in September 2025)
const NOW = new Date('2025-09-19T09:00:00Z');

describe('connecting a diary: the first sync in the same login (design.md 10.4)', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  it('one login; the answer does not wait; standing weeks and history are read in that run', async () => {
    const log: TransportRequest[] = [];
    let firstSync: Promise<unknown> | undefined;
    const app = testApp({
      now: () => NOW,
      transportFor: () => demoFullTransport({ log }),
      background: (work) => void (firstSync = work),
    });
    const res = await request(app)
      .post('/api/auth/connect')
      .send({
        providerId: 'demo-full',
        credentials: { login: 'diary-user', password: 'diary-pw-123' },
        role: 'parent',
        user: { login: 'parent@example.com', password: 'correct horse battery', displayName: 'Мама' },
        consentVersion: CONSENT,
      });
    expect(res.status).toBe(201);
    expect(firstSync).toBeDefined();
    await firstSync;

    // exactly one login request, ever
    expect(log.filter((r) => r.method === 'POST')).toHaveLength(1);
    const [run] = await db.select().from(syncRuns);
    expect(run).toMatchObject({ kind: 'connect', status: 'success' });
    expect(run!.requests).toBeGreaterThan(2);
    // the weeks were read in that run, the bodies stored with it, the account counts the success
    const covered = await db.select().from(syncCoverage);
    expect(covered.length).toBeGreaterThan(0);
    expect(covered.every((c) => c.runId === run!.id)).toBe(true);
    expect((await db.select().from(lessons)).length).toBeGreaterThan(0);
    expect((await db.select().from(rawResponses).where(eq(rawResponses.syncRunId, run!.id))).length).toBeGreaterThan(0);
    const [account] = await db.select().from(diaryAccounts);
    expect(account!.lastSuccessAt).toEqual(NOW);
  });
});
