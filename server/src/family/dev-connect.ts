import type { Transport } from '@marksy/core';
import { and, asc, eq, sql } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import { claimLogin, refusalText } from '../cli/login-guard';
import type { Runner } from '../cli/login-guard';
import type { Db } from '../db/client';
import { diaryAccounts, familyStudents, memberships, users } from '../db/schema';
import { connectDiary, connectableProvider } from './connect';
import { rulesForMember, welcomeChild } from './rules';

// `pnpm dev:connect` (docs/build-plan.md M4): the owner's own family on their own machine, from the logins in .env,
// through the same service as «Подключить дневник». Idempotent: run again after a database reset or on top of what
// `pnpm sync:once` created, it adopts the diary account that is already there (no diary login at all), creates the
// Marksy login if it is missing and makes it the family's admin. Only a diary not connected yet costs a real login,
// through the login guard.

export interface DevConnectInput {
  providerId: string;
  diary: { login: string; password: string };
  marksy: { login: string; password: string };
  runner: Runner;
  credentialsKey: Buffer;
  now?: () => Date;
  transport?: Transport;
  allowDemoProviders?: boolean;
}

export type DevConnectResult =
  | { outcome: 'adopted' | 'connected' | 'unchanged'; familyId: string; children: number }
  | { outcome: 'refused'; message: string };

async function ensureUser(db: Db, login: string, password: string): Promise<string> {
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.login}) = lower(${login})`);
  if (user) return user.id;
  const displayName = login.split('@')[0]!.slice(0, 60) || 'Admin';
  const [created] = await db
    .insert(users)
    .values({ login, displayName, passwordHash: await hashPassword(password) })
    .returning();
  return created!.id;
}

async function activeChildren(db: Db, familyId: string): Promise<string[]> {
  const rows = await db
    .select({ studentId: familyStudents.studentId })
    .from(familyStudents)
    .where(and(eq(familyStudents.familyId, familyId), eq(familyStudents.status, 'active')));
  return rows.map((r) => r.studentId);
}

export async function devConnect(db: Db, input: DevConnectInput): Promise<DevConnectResult> {
  const provider = connectableProvider(input.providerId, input.allowDemoProviders);
  const now = input.now?.() ?? new Date();
  const [account] = await db
    .select({ familyId: diaryAccounts.familyId })
    .from(diaryAccounts)
    .where(
      and(
        eq(diaryAccounts.providerId, provider.manifest.id),
        sql`lower(${diaryAccounts.label}) = lower(${input.diary.login.trim()})`,
      ),
    );
  if (account) {
    // the diary is connected already (pnpm sync:once, or an earlier run): the Marksy login becomes its admin
    const userId = await ensureUser(db, input.marksy.login, input.marksy.password);
    const [member] = await db
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.familyId, account.familyId)));
    if (!member) await db.insert(memberships).values({ userId, familyId: account.familyId, role: 'admin' });
    const children = await activeChildren(db, account.familyId);
    for (const studentId of children) await welcomeChild(db, account.familyId, studentId);
    await rulesForMember(db, userId, account.familyId, member?.role ?? 'admin');
    return { outcome: member ? 'unchanged' : 'adopted', familyId: account.familyId, children: children.length };
  }

  const claim = await claimLogin(db, {
    providerId: provider.manifest.id,
    login: input.diary.login,
    command: 'dev:connect',
    runner: input.runner,
    minLoginIntervalMinutes: provider.manifest.limits.minLoginIntervalMinutes,
    timezone: provider.manifest.timezone,
    now,
  });
  if (!claim.ok) return { outcome: 'refused', message: refusalText(claim, provider.manifest.timezone) };
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.login}) = lower(${input.marksy.login})`);
  const [family] = existing
    ? await db
        .select({ familyId: memberships.familyId })
        .from(memberships)
        .where(eq(memberships.userId, existing.id))
        .orderBy(asc(memberships.createdAt))
        .limit(1)
    : [];
  const deps = {
    db,
    credentialsKey: input.credentialsKey,
    ...(input.now && { now: input.now }),
    transport: input.transport,
    ...(input.allowDemoProviders && { allowDemoProviders: true }),
  };
  const credentials = { login: input.diary.login, password: input.diary.password };
  const result =
    existing && family
      ? await connectDiary(deps, {
          providerId: provider.manifest.id,
          credentials,
          role: 'parent',
          into: { familyId: family.familyId, userId: existing.id },
        })
      : await connectDiary(deps, {
          providerId: provider.manifest.id,
          credentials,
          role: 'parent',
          newUser: {
            login: input.marksy.login,
            password: input.marksy.password,
            displayName: input.marksy.login.split('@')[0]!.slice(0, 60) || 'Admin',
            consentVersion: 'dev',
          },
        });
  return {
    outcome: 'connected',
    familyId: result.familyId,
    children: result.children.filter((c) => c.outcome === 'linked').length,
  };
}
