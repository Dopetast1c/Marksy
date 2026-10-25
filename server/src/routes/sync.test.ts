import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, testApp } from '../../test/app';
import { agentWith, connectFamily } from '../../test/connect';
import { resetDb, testDb } from '../../test/db';
import { apiDriftEvents, diaryAccounts, syncCoverage, syncRuns } from '../db/schema';

const db = testDb();
// Wednesday 15 October 2025, 10:00 at the demo school: a school day, inside the window
const NOW = new Date('2025-10-15T07:00:00Z');

describe('Синхронизация', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  it('the state card: today’s window and whose it is, the next run and why, what it takes, the re-scan, no samples', async () => {
    const mama = agentWith({ now: () => NOW });
    const { connect } = await connectFamily(mama);
    await settle();
    const status = (await mama.get('/api/sync/status')).body;
    const plan = status.accounts.find((a: { id: string }) => a.id === connect.accountId).plan;
    expect(plan).toMatchObject({
      next: expect.objectContaining({ kind: expect.any(String) }),
      sets: expect.any(Object),
      maxRequestsPerRun: expect.any(Number),
      rescan: expect.objectContaining({ oldestVerifiedAt: expect.any(String) }),
      drift: [],
    });
    // the connect run used this hour's login: the next one waits for the interval
    expect(plan.next.kind).toBe('at');
  });

  it('«Обновить сейчас» within the login budget: right after a run it says when; never for a student or another family', async () => {
    const mama = agentWith({ now: () => NOW });
    const { connect } = await connectFamily(mama);
    await settle();
    const res = await mama.post('/api/sync/run').send({ accountId: connect.accountId });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ started: false, reason: 'interval', retryAt: expect.any(String) });
    await settle();
    // the manual try left a skipped row: the log says what happened
    const runs = await db.select().from(syncRuns).where(eq(syncRuns.diaryAccountId, connect.accountId));
    expect(runs.some((r) => r.status === 'skipped_interval')).toBe(true);
    const other = agentWith({ now: () => NOW });
    await connectFamily(other, 'other@example.com', 'demo-minimal');
    expect((await other.post('/api/sync/run').send({ accountId: connect.accountId })).status).toBe(404);
    expect((await request(testApp()).post('/api/sync/run').send({ accountId: connect.accountId })).status).toBe(401);
  });

  it('«Перепроверить» takes the checks off the term’s weeks: the planner reads them again', async () => {
    const mama = agentWith({ now: () => NOW });
    const { connect } = await connectFamily(mama);
    await settle();
    const before = (await db.select().from(syncCoverage)).length;
    expect(before).toBeGreaterThan(0);
    const res = await mama.post('/api/sync/rescan').send({ accountId: connect.accountId, period: 'term' });
    expect(res.status).toBe(200);
    expect(res.body.weeks).toBeGreaterThan(0);
    await settle();
    const status = (await mama.get('/api/sync/status')).body;
    const plan = status.accounts[0].plan;
    // the term's older weeks are unverified now: the planner takes them as never read
    expect(plan.sets.backfill ?? 0).toBeGreaterThan(0);
  });

  it('a change in the diary’s API: kind and place, never the sample; «Понятно, скрыть» hides it for the family’s diaries only', async () => {
    const mama = agentWith({ now: () => NOW });
    await connectFamily(mama);
    await settle();
    const [ours] = await db
      .insert(apiDriftEvents)
      .values({
        providerId: 'demo-full',
        endpoint: 'diary',
        kind: 'unknown_field',
        path: 'days[].lessons[].extra',
        sample: 'a value',
        firstSeenAt: NOW,
        lastSeenAt: NOW,
      })
      .returning();
    const [theirs] = await db
      .insert(apiDriftEvents)
      .values({
        providerId: 'demo-minimal',
        endpoint: 'x',
        kind: 'unknown_field',
        path: 'y',
        firstSeenAt: NOW,
        lastSeenAt: NOW,
      })
      .returning();
    const drift = (await mama.get('/api/sync/status')).body.accounts[0].plan.drift;
    expect(drift).toEqual([expect.objectContaining({ id: ours!.id, path: 'days[].lessons[].extra' })]);
    expect(JSON.stringify(drift)).not.toContain('a value');
    expect((await mama.post(`/api/sync/drift/${theirs!.id}/ack`)).status).toBe(404);
    expect((await mama.post(`/api/sync/drift/${ours!.id}/ack`)).status).toBe(204);
    expect((await mama.get('/api/sync/status')).body.accounts[0].plan.drift).toEqual([]);
  });
});

describe('Внимание: a diary that needs a new password', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  it('the admin sees one critical row leading to Синхронизация while the diary refuses the login', async () => {
    const mama = agentWith({ now: () => NOW });
    const { connect, students } = await connectFamily(mama);
    await settle();
    const kid = students[0]!.id;
    const kinds = async () =>
      ((await mama.get(`/api/students/${kid}/events?period=week`)).body.items as { kind: string }[]).map((e) => e.kind);
    expect(await kinds()).not.toContain('account_action');
    await db.update(diaryAccounts).set({ requiresAction: 'auth' }).where(eq(diaryAccounts.id, connect.accountId));
    const items = (await mama.get(`/api/students/${kid}/events?period=week`)).body.items as {
      kind: string;
      severity: string;
      facts: { action: string };
      link: { screen: string };
    }[];
    expect(items.find((e) => e.kind === 'account_action')).toMatchObject({
      severity: 'critical',
      facts: { action: 'auth' },
      link: { screen: 'sync' },
    });
  });
});
