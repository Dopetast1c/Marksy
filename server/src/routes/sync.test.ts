import { addDays } from '@marksy/core';
import { getProvider } from '@marksy/registry';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { settle, testApp } from '../../test/app';
import { agentWith, connectFamily } from '../../test/connect';
import { resetDb, testDb } from '../../test/db';
import { createAccount } from '../../test/factories';
import { apiDriftEvents, diaryAccounts, holidays, syncCoverage, syncRuns } from '../db/schema';
import { readSyncConfig } from '../sync/config';
import { accountPlan } from '../sync/account-plan';
import { massRemovalEndpoint } from '../sync/drift-scope';
import { syncPlanOf } from '../sync/status';

const db = testDb();
// Wednesday 15 October 2025, 10:00 at the demo school: a school day, inside the window
const NOW = new Date('2025-10-15T07:00:00Z');

describe('Sync (sync.title)', () => {
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

    // a student of the family: the freshness of their own data, never the diary login or the planner's view
    const kid = status.students[0].id as string;
    const code = (await mama.post('/api/family/invites').send({ role: 'student', studentIds: [kid] })).body.code;
    const student = agentWith({ now: () => NOW });
    await student
      .post(`/api/invites/${code}/accept`)
      .send({ login: 'kid@example.com', password: 'correct horse battery', displayName: 'Ребёнок' });
    const seen = (await student.get('/api/sync/status')).body;
    expect(seen.accounts[0]).toMatchObject({ label: null, plan: null, studentIds: [kid] });
    expect(seen.students.map((s: { id: string }) => s.id)).toEqual([kid]);
  });

  it('after today’s window: the next school day with its time; across holidays it says so', async () => {
    const mama = agentWith({ now: () => NOW });
    const { connect } = await connectFamily(mama);
    await settle();
    const [account] = await db.select().from(diaryAccounts).where(eq(diaryAccounts.id, connect.accountId));
    const manifest = getProvider('demo-full')!.manifest;
    const next = async (at: string) =>
      (await accountPlan(db, account!, manifest, readSyncConfig(), new Date(at))).nextSchoolDay;
    // Friday evening, a school week ahead: the next school day
    const friday = await next('2025-10-17T18:00:00Z');
    // the demo's Monday has no lessons stored and its manifest no window: the day is known, its time is not
    expect(friday).toMatchObject({ afterHolidays: false, from: null });
    expect(friday!.date > '2025-10-17' && friday!.date < '2025-10-21').toBe(true);
    // the evening before the autumn holidays, as the diary gave them: the first school day after them
    const autumn = (await db.select().from(holidays)).find(
      (h) => h.endDate >= '2025-10-31' && h.startDate <= '2025-11-15',
    )!;
    const before = await next(`${addDays(autumn.startDate, -1)}T18:00:00Z`);
    expect(before).toMatchObject({ afterHolidays: true });
    expect(before!.date > autumn.endDate).toBe(true);
    expect(before!.date <= addDays(autumn.endDate, 3)).toBe(true);
  });

  it('"Refresh now" (sync.refresh) within the login budget: right after a run it says when; never for a student or another family', async () => {
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

  it('"Check the history again" (sync.rescan.button) takes the checks off the term’s weeks: the planner reads them again', async () => {
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

  it('the terms’ state (D61), and a re-check of one finished term reads only its weeks again', async () => {
    const november = new Date('2025-11-19T07:00:00Z');
    const mama = agentWith({ now: () => november });
    const { connect } = await connectFamily(mama);
    await settle();
    const plan = (await mama.get('/api/sync/status')).body.accounts[0].plan;
    const first = plan.terms[0];
    // the first quarter ended on 31 October: more than TERM_CLOSE_DAYS ago, so it is closed
    expect(first.terms[0]).toMatchObject({ index: 1, state: 'closed', closesOn: null, weeks: expect.any(Number) });
    expect(first.terms[0].weeks).toBeGreaterThan(5);
    expect(first.terms.at(-1)).toMatchObject({ state: 'current' });
    expect(first.yearWeeks).toBeGreaterThan(first.terms[0].weeks);
    expect(plan.rescanPerRun).toBeGreaterThan(0);

    const q1 = first.terms[0] as { start: string; end: string };
    const covered = async () =>
      (await db.select().from(syncCoverage)).filter((c) => c.studentId === first.studentId).map((c) => c.weekStart);
    const before = await covered();
    const res = await mama
      .post('/api/sync/rescan')
      .send({ accountId: connect.accountId, period: 'finished', termIndex: 1, studentIds: [first.studentId] });
    expect(res.status).toBe(200);
    expect(res.body.weeks).toBeGreaterThan(0);
    await settle();
    const after = await covered();
    const gone = before.filter((w) => !after.includes(w));
    expect(gone.length).toBe(res.body.weeks);
    expect(gone.every((w) => w >= addDays(q1.start, -6) && w <= q1.end)).toBe(true);
    // a parent who sees one of the children gets that child's terms only
    const kid = first.studentId as string;
    const code = (await mama.post('/api/family/invites').send({ role: 'parent', studentIds: [kid] })).body.code;
    const papa = agentWith({ now: () => november });
    await papa
      .post(`/api/invites/${code}/accept`)
      .send({ login: 'papa@example.com', password: 'correct horse battery', displayName: 'Папа' });
    const seen = (await papa.get('/api/sync/status')).body.accounts[0].plan;
    expect(seen.terms.map((c: { studentId: string }) => c.studentId)).toEqual([kid]);
    expect(plan.terms.length).toBeGreaterThan(1);

    // the current term is not a finished one
    const current = await mama
      .post('/api/sync/rescan')
      .send({ accountId: connect.accountId, period: 'finished', termIndex: first.terms.at(-1).index });
    expect(current.body.weeks).toBe(0);
  });

  it('a change in the diary’s API: kind and place, never the sample; "Got it, hide" (sync.drift.ack) hides it for the family’s diaries only', async () => {
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
    expect((await mama.post(`/api/sync/drift/${ours!.id}/ack`)).status).toBe(204);
    expect((await mama.get('/api/sync/status')).body.accounts[0].plan.drift).toEqual([]);
    // another family whose diary is on the same provider still sees it
    const { account } = await createAccount(db, 'demo-full');
    const theirsPlan = await syncPlanOf(db, account, getProvider('demo-full')!.manifest, readSyncConfig(), NOW);
    expect(theirsPlan.drift).toEqual([expect.objectContaining({ id: ours!.id })]);

    // a hold of the mass-removal guard is the account's own: its family sees "collector", another family nothing
    const mine = (await db.select().from(diaryAccounts)).find((a) => a.id !== account.id)!;
    await db.insert(apiDriftEvents).values({
      providerId: 'demo-full',
      endpoint: massRemovalEndpoint(mine.id),
      kind: 'mass_removal',
      path: 'marks',
      firstSeenAt: NOW,
      lastSeenAt: NOW,
    });
    const manifest = getProvider('demo-full')!.manifest;
    const own = await syncPlanOf(db, mine, manifest, readSyncConfig(), NOW);
    expect(own.drift).toEqual([expect.objectContaining({ kind: 'mass_removal', endpoint: 'collector' })]);
    const other = await syncPlanOf(db, account, manifest, readSyncConfig(), NOW);
    expect(other.drift.map((d) => d.kind)).not.toContain('mass_removal');
  });
});

describe('Attention (screen.events): a diary that needs a new password', () => {
  beforeEach(() => resetDb(db));
  afterEach(settle);

  it('the admin sees one critical row leading to Sync (sync.title) while the diary refuses the login', async () => {
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
