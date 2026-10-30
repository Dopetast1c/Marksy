import { ProviderAuthError, ProviderBlockedError, ProviderNeeds2FAError, ProviderUnavailableError } from '@marksy/core';
import type { AccountInfo, DiaryProvider, Logger, Transport } from '@marksy/core';
import { getProvider, listProviders } from '@marksy/registry';
import { and, eq, ne, sql } from 'drizzle-orm';
import { hashPassword } from '../auth/password';
import { encryptCredentials } from '../crypto/credentials';
import type { Db } from '../db/client';
import { diaryAccounts, families, familyStudents, memberships, syncRuns, users } from '../db/schema';
import { HttpError } from '../http/errors';
import type { SyncConfig } from '../sync/config';
import { openLogin } from '../sync/opened';
import type { OpenedLogin } from '../sync/opened';
import { runSync } from '../sync/run';
import type { RunSyncResult } from '../sync/run';
import { linkFamily, rebalance } from '../sync/sources';
import { upsertListedStudent } from '../sync/store-school';
import { rulesForMember } from './rules';

// Connecting a diary (docs/design.md 7.2): "Connect a diary" (login.mode.connect) signed out creates the family and
// its admin; "Add a diary" (family.addDiary) in Family (family.title) adds the account to the current family;
// `pnpm dev:connect` runs the same. One login to the diary through the shared client (it counts as that hour's login
// for the account), then getAccount(). A child another family already follows is not linked here: the parent chooses
// "Join that family" (match.join) or "From your own family" (match.follow) (matches). The first sync goes on in the same login at once (design.md 10.4: a new account runs at once and
// backfills): standing weeks, then the history within the request cap, without a second login. The answer does not wait
// for it; the app shows "reading the diary" (sync.status.loading) from /api/sync/status.

export interface ConnectInput {
  providerId: string;
  credentials: Record<string, string>;
  role: 'parent' | 'student';
  /** Signed out: the Marksy account to create, and the consent text version the person agreed to */
  newUser?: { login: string; password: string; displayName: string; consentVersion: string };
  /** Signed in: the family to add the diary to, and who does it */
  into?: { familyId: string; userId: string };
}

export interface ConnectResult {
  familyId: string;
  userId: string;
  accountId: string;
  /** Children of this login, and what happened to each */
  children: { studentId: string; outcome: 'linked' | 'match' }[];
  /** The first sync in the same login, under way; the caller does not wait for it */
  firstSync: Promise<RunSyncResult>;
}

export interface ConnectDeps {
  db: Db;
  credentialsKey: Buffer;
  now?: () => Date;
  transport?: Transport | undefined;
  allowDemoProviders?: boolean;
  /** The collector's settings for the first sync */
  syncConfig: SyncConfig;
  sleep?: (ms: number) => Promise<void>;
  log?: Logger;
}

/** A provider the person may connect: one offered to families (or any, for tests and the demo) */
export function connectableProvider(providerId: string, allowDemo = false): DiaryProvider {
  const provider = getProvider(providerId);
  const offered = listProviders().some((p) => p.manifest.id === providerId);
  if (!provider || (!offered && !allowDemo)) throw new HttpError(400, 'unknown_provider', 'No such diary system');
  return provider;
}

/** One login and getAccount(), kept open for the first sync, with the diary's refusals as API errors (never its text) */
async function readAccount(
  provider: DiaryProvider,
  credentials: Record<string, string>,
  deps: ConnectDeps,
): Promise<OpenedLogin> {
  try {
    return await openLogin(provider, credentials, {
      transport: deps.transport,
      ...(deps.now && { now: deps.now }),
      ...(deps.sleep && { sleep: deps.sleep }),
      ...(deps.log && { log: deps.log }),
      stricter: { maxRequestsPerRun: deps.syncConfig.maxRequestsPerRun },
    });
  } catch (err) {
    if (err instanceof ProviderNeeds2FAError) throw new HttpError(409, 'needs_2fa', 'The diary asks for a code');
    if (err instanceof ProviderAuthError)
      throw new HttpError(401, 'diary_auth_failed', 'The diary did not accept this login and password');
    if (err instanceof ProviderBlockedError) throw new HttpError(403, 'diary_blocked', 'The diary blocked this login');
    if (err instanceof ProviderUnavailableError || err instanceof TypeError)
      throw new HttpError(503, 'diary_unavailable', 'The diary does not answer now; try again later');
    throw err;
  }
}

export async function connectDiary(deps: ConnectDeps, input: ConnectInput): Promise<ConnectResult> {
  const { db } = deps;
  const now = deps.now?.() ?? new Date();
  const provider = connectableProvider(input.providerId, deps.allowDemoProviders);
  // design.md 7.5: the student diary login is not verified yet
  if (input.role === 'student')
    throw new HttpError(400, 'student_login_not_supported', 'Connecting a student diary login is not supported yet');
  const fields = provider.manifest.auth.fields.map((f) => f.key);
  const missing = fields.filter((k) => !input.credentials[k]?.trim());
  if (missing.length) throw new HttpError(400, 'invalid_request', 'Fill in every field', { missing });
  const credentials = Object.fromEntries(fields.map((k) => [k, input.credentials[k]!]));
  if (!input.newUser && !input.into) throw new HttpError(400, 'invalid_request', 'Sign in or create an account');
  // a diary login connected already is refused before the diary is called: no login is spent on it
  const label = credentials.login ?? credentials[fields[0]!] ?? provider.manifest.id;
  const [byLabel] = await db
    .select({ id: diaryAccounts.id })
    .from(diaryAccounts)
    .where(
      and(
        eq(diaryAccounts.providerId, provider.manifest.id),
        sql`lower(${diaryAccounts.label}) = lower(${label.trim()})`,
      ),
    );
  if (byLabel) throw alreadyConnected();

  const opened = await readAccount(provider, credentials, deps);
  const { info } = opened;
  await refuseKnownAccount(db, provider.manifest.id, info, now);
  // only someone the diary accepted learns whether a Marksy login is taken (no enumeration through this public route)
  if (input.newUser) {
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.login}) = lower(${input.newUser.login.trim()})`);
    if (taken) throw new HttpError(409, 'login_taken', 'This Marksy login is taken');
  }
  const passwordHash = input.newUser ? await hashPassword(input.newUser.password) : null;

  const done = await db
    .transaction(async (txn) => {
      // two connects of one login at once: the unique index on (provider_id, external_user_id) refuses the second
      // the collector's helpers take the database; inside the transaction they run on it the same way
      const tx = txn as unknown as Db;
      let familyId: string;
      let userId: string;
      if (input.newUser) {
        const nu = input.newUser;
        const [family] = await tx
          .insert(families)
          .values({ name: nu.displayName, consentVersion: nu.consentVersion, consentAt: now })
          .returning();
        familyId = family!.id;
        const [user] = await tx
          .insert(users)
          .values({ login: nu.login.trim(), displayName: nu.displayName.trim(), passwordHash: passwordHash! })
          .returning();
        userId = user!.id;
        await tx.update(families).set({ consentBy: userId }).where(eq(families.id, familyId));
        await tx.insert(memberships).values({ userId, familyId, role: 'admin' });
      } else {
        ({ familyId, userId } = input.into!);
      }

      const [account] = await tx
        .insert(diaryAccounts)
        .values({
          familyId,
          providerId: provider.manifest.id,
          role: input.role,
          label,
          credentialsEnc: encryptCredentials(credentials, familyId, deps.credentialsKey),
          externalUserId: info.externalUserId,
          status: 'ok',
          lastOkAt: now,
          // this login is the account's login of this hour (design.md 7.2 step 2)
          lastLoginAt: now,
          lastAttemptAt: now,
        })
        .returning();
      const ref = { id: account!.id, familyId, providerId: provider.manifest.id };

      const children: ConnectResult['children'] = [];
      for (const s of info.students) {
        const student = await upsertListedStudent(tx, ref, s, now);
        const [own] = await tx
          .select({ status: familyStudents.status })
          .from(familyStudents)
          .where(and(eq(familyStudents.familyId, familyId), eq(familyStudents.studentId, student.id)));
        const [other] = await tx
          .select({ familyId: familyStudents.familyId })
          .from(familyStudents)
          .where(
            and(
              eq(familyStudents.studentId, student.id),
              ne(familyStudents.familyId, familyId),
              eq(familyStudents.status, 'active'),
            ),
          );
        // a child another family follows waits for the parent's choice (design.md 7.2 step 3)
        if (!own && other) {
          children.push({ studentId: student.id, outcome: 'match' });
          continue;
        }
        await linkFamily(tx, familyId, student.id, now);
        await rebalance(tx, student.id, now);
        children.push({ studentId: student.id, outcome: 'linked' });
      }
      // the admin of a new family sees every child and gets their rules (linkFamily did it for children it linked)
      if (input.newUser) await rulesForMember(tx, userId, familyId, 'admin');
      const [run] = await tx
        .insert(syncRuns)
        .values({
          familyId,
          diaryAccountId: account!.id,
          providerId: provider.manifest.id,
          kind: 'connect',
          trigger: `user:${userId}`,
          startedAt: now,
          status: 'running',
        })
        .returning({ id: syncRuns.id });
      return { familyId, userId, accountId: account!.id, children, runId: run!.id };
    })
    .catch((err: unknown) => {
      if ((err as { code?: string }).code === '23505' || (err as { cause?: { code?: string } }).cause?.code === '23505')
        throw alreadyConnected();
      throw err;
    });
  const firstSync = runSync({
    db,
    accountId: done.accountId,
    trigger: `user:${done.userId}`,
    config: deps.syncConfig,
    opened: { login: opened, runId: done.runId },
    credentialsKey: deps.credentialsKey,
    ...(deps.now && { now: deps.now }),
    ...(deps.sleep && { sleep: deps.sleep }),
    ...(deps.log && { log: deps.log }),
    provider: (id) => (id === provider.manifest.id ? provider : undefined),
  });
  return {
    familyId: done.familyId,
    userId: done.userId,
    accountId: done.accountId,
    children: done.children,
    firstSync,
  };
}

const alreadyConnected = () =>
  new HttpError(409, 'already_connected', 'This diary is already connected; ask the family admin for an invite');

/**
 * design.md 7.2 step 3: a diary login connected anywhere already is refused. Found only after the login (another
 * label for the same diary user), that login was the account's login of this hour: it is recorded there, so the
 * account's next run keeps the interval
 */
async function refuseKnownAccount(db: Db, providerId: string, info: AccountInfo, now: Date) {
  const [known] = await db
    .select({ id: diaryAccounts.id })
    .from(diaryAccounts)
    .where(and(eq(diaryAccounts.providerId, providerId), eq(diaryAccounts.externalUserId, info.externalUserId)));
  if (!known) return;
  await db.update(diaryAccounts).set({ lastLoginAt: now }).where(eq(diaryAccounts.id, known.id));
  throw alreadyConnected();
}
