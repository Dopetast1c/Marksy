import { getProvider } from '@marksy/registry';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { Router } from 'express';
import { z } from 'zod';
import { encryptCredentials } from '../crypto/credentials';
import type { Db } from '../db/client';
import {
  diaryAccounts,
  families,
  familyStudents,
  joinRequests,
  memberships,
  students,
  studentSources,
  userStudentAccess,
  users,
} from '../db/schema';
import type { FamilySettings } from '../db/schema';
import { childName, chooseMatch, decideJoin, deleteChildData, followAgain, stopFollowing } from '../family/children';
import { connectDiary } from '../family/connect';
import { eraseFamily, exportFamily } from '../family/data';
import { createInvite } from '../family/invites';
import { changeMember, removeMember } from '../family/members';
import type { AppDeps } from '../http/context';
import { connectDepsOf, inBackground, memberOf } from '../http/context';
import { HttpError } from '../http/errors';
import { underLimit } from '../http/rate-limit';
import type { Limiters } from '../http/rate-limit';
import { route } from '../http/route';
import { diaryKey } from './auth';
import { registry } from '../openapi';
import { avatarOf, avatarOut } from '../students/avatar';
import { studentScale } from '../students/scale';

// Семья (docs/design.md 5.6, 7, 9, 14.1): members, diary accounts, the children the family follows, invites, join
// requests, and the family's data. Names of another family's members never appear: a shared child shows only
// «Также следит другая семья».

const role = z.enum(['admin', 'parent', 'student']);
const id = z.string().uuid();
const adults = { roles: ['admin', 'parent'] as ('admin' | 'parent' | 'student')[] };
const admin = { roles: ['admin'] as ('admin' | 'parent' | 'student')[] };

const familyView = registry.register(
  'Family',
  z.object({
    /** guidance: the family's «Подсказки» switch (admin); advice shows when the person's own is on too */
    family: z.object({ id: z.string(), name: z.string(), parentsCanInvite: z.boolean(), guidance: z.boolean() }),
    role,
    members: z.array(z.object({ userId: z.string(), displayName: z.string(), role, studentIds: z.array(z.string()) })),
    accounts: z.array(
      z.object({
        id: z.string(),
        providerId: z.string(),
        providerName: z.string(),
        /** The diary login, as the family sees it in Семья */
        label: z.string(),
        status: z.enum(['ok', 'auth_failed', 'blocked', 'needs_2fa']),
        requiresAction: z.enum(['auth', 'blocked', 'needs_2fa']).nullable(),
        studentIds: z.array(z.string()),
      }),
    ),
    children: z.array(
      z.object({
        studentId: z.string(),
        name: z.string(),
        classLabel: z.string().nullable(),
        schoolLabel: z.string().nullable(),
        status: z.enum(['active', 'suspended', 'stopped']),
        /** «Также следит другая семья»: nothing more about that family */
        sharedWithOtherFamily: z.boolean(),
        avatar: avatarOut,
        settings: z.object({
          lowMark: z.number().nullable(),
          dropStep: z.number().nullable(),
          callAfter: z.number().nullable(),
        }),
      }),
    ),
    /** Children of the family's logins that another family follows: join or follow (design.md 7.2 step 3) */
    matches: z.array(z.object({ accountId: z.string(), studentId: z.string(), name: z.string() })),
    /** For the admin: people who asked to join with their diary login */
    joinRequests: z.array(
      z.object({
        id: z.string(),
        displayName: z.string(),
        createdAt: z.date(),
        /** the diary they connected: its system and login, so the admin knows whom they let in (D54) */
        diary: z.object({ providerName: z.string(), label: z.string() }).nullable(),
      }),
    ),
  }),
);

async function viewFamily(db: Db, familyId: string, myRole: 'admin' | 'parent' | 'student') {
  const [family] = await db.select().from(families).where(eq(families.id, familyId));
  if (!family) throw new HttpError(404, 'not_found', 'No such family');
  const people = await db
    .select({ userId: users.id, displayName: users.displayName, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.familyId, familyId))
    .orderBy(asc(memberships.createdAt));
  const access = await db
    .select({ userId: userStudentAccess.userId, studentId: userStudentAccess.studentId })
    .from(userStudentAccess)
    .where(eq(userStudentAccess.familyId, familyId));
  const accountRows = await db.select().from(diaryAccounts).where(eq(diaryAccounts.familyId, familyId));
  const sources = accountRows.length
    ? await db
        .select({ accountId: studentSources.diaryAccountId, studentId: studentSources.studentId })
        .from(studentSources)
        .where(
          inArray(
            studentSources.diaryAccountId,
            accountRows.map((a) => a.id),
          ),
        )
    : [];
  const links = await db
    .select({ link: familyStudents, student: students })
    .from(familyStudents)
    .innerJoin(students, eq(students.id, familyStudents.studentId))
    .where(eq(familyStudents.familyId, familyId));
  const linked = new Set(links.map((l) => l.student.id));
  const others = links.length
    ? await db
        .select({ studentId: familyStudents.studentId })
        .from(familyStudents)
        .where(
          and(
            inArray(
              familyStudents.studentId,
              links.map((l) => l.student.id),
            ),
            ne(familyStudents.familyId, familyId),
          ),
        )
    : [];
  const shared = new Set(others.map((o) => o.studentId));
  const pendingIds = [...new Set(sources.filter((s) => !linked.has(s.studentId)).map((s) => s.studentId))];
  const pending = pendingIds.length ? await db.select().from(students).where(inArray(students.id, pendingIds)) : [];
  const requests =
    myRole === 'admin'
      ? await db
          .select({
            id: joinRequests.id,
            displayName: users.displayName,
            createdAt: joinRequests.createdAt,
            providerId: diaryAccounts.providerId,
            label: diaryAccounts.label,
          })
          .from(joinRequests)
          .innerJoin(users, eq(users.id, joinRequests.fromUserId))
          .leftJoin(diaryAccounts, eq(diaryAccounts.id, joinRequests.diaryAccountId))
          .where(and(eq(joinRequests.familyId, familyId), eq(joinRequests.status, 'pending')))
      : [];
  return {
    family: {
      id: family.id,
      name: family.name,
      parentsCanInvite: family.settings.parents_can_invite ?? true,
      guidance: family.settings.guidance !== false,
    },
    role: myRole,
    members: people.map((p) => ({
      ...p,
      studentIds: access.filter((a) => a.userId === p.userId).map((a) => a.studentId),
    })),
    accounts: accountRows.map((a) => ({
      id: a.id,
      providerId: a.providerId,
      providerName: getProvider(a.providerId)?.manifest.name ?? a.providerId,
      label: a.label,
      status: a.status,
      requiresAction: a.requiresAction,
      studentIds: sources.filter((s) => s.accountId === a.id && linked.has(s.studentId)).map((s) => s.studentId),
    })),
    children: links.map(({ link, student }) => ({
      studentId: student.id,
      name: childName(student),
      classLabel: student.classLabel,
      schoolLabel: student.schoolLabel,
      status: link.status,
      sharedWithOtherFamily: shared.has(student.id),
      avatar: avatarOf(student.avatar, student.id),
      settings: {
        lowMark: link.settings.low_mark ?? null,
        dropStep: link.settings.drop_step ?? null,
        callAfter: link.settings.call_after ?? null,
      },
    })),
    matches: sources
      .filter((s) => !linked.has(s.studentId))
      .map((s) => {
        const student = pending.find((p) => p.id === s.studentId)!;
        return { accountId: s.accountId, studentId: s.studentId, name: childName(student) };
      }),
    joinRequests: requests.map(({ providerId, label, ...r }) => ({
      ...r,
      diary: providerId && label ? { providerName: getProvider(providerId)?.manifest.name ?? providerId, label } : null,
    })),
  };
}

/** Parents may invite unless the admin switched it off (design.md 7.6) */
async function mayInvite(db: Db, familyId: string, myRole: string) {
  if (myRole === 'admin') return;
  const [family] = await db.select({ settings: families.settings }).from(families).where(eq(families.id, familyId));
  const settings: FamilySettings = family?.settings ?? {};
  if (myRole !== 'parent' || settings.parents_can_invite === false)
    throw new HttpError(403, 'forbidden', 'Your role does not allow inviting');
}

export function familyRoutes(deps: AppDeps, limiters: Limiters): Router {
  const r = Router();
  const now = () => deps.now?.() ?? new Date();

  route(
    r,
    {
      method: 'get',
      path: '/api/family',
      summary: 'Семья: members, diary accounts, children, choices to make, join requests',
      tags: ['family'],
      access: adults,
      response: familyView,
    },
    async (req) => {
      const m = memberOf(req);
      return viewFamily(deps.db, m.familyId, m.role);
    },
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/family/accounts',
      summary: 'Add a diary to the current family (Семья → «Добавить дневник»)',
      tags: ['family'],
      access: adults,
      status: 201,
      body: z.object({
        providerId: z.string().min(1),
        credentials: z.record(z.string(), z.string().max(500)),
        role: z.enum(['parent', 'student']),
      }),
      response: familyView,
      errors: {
        400: 'Unknown diary system or a student diary login',
        401: 'The diary refused the login',
        409: 'Connected already, or needs_2fa',
        503: 'The diary does not answer',
      },
    },
    async (req, { body }) => {
      const m = memberOf(req);
      const result = await underLimit(limiters.connect, req.ip ?? 'unknown', diaryKey(body), () =>
        connectDiary(connectDepsOf(deps, body.providerId), {
          ...body,
          into: { familyId: m.familyId, userId: m.userId },
        }),
      );
      inBackground(deps, result.firstSync);
      return viewFamily(deps.db, m.familyId, m.role);
    },
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/family/accounts/:id/matches/:studentId',
      summary: '«Присоединиться» or «Следить из своей семьи» for a child another family follows',
      tags: ['family'],
      access: adults,
      params: z.object({ id, studentId: id }),
      body: z.object({ action: z.enum(['join', 'follow']) }),
      response: z.object({ outcome: z.enum(['followed', 'requested']) }),
      errors: { 404: 'No such choice', 409: 'No other family follows this child now' },
    },
    async (req, { params, body }) => {
      const m = memberOf(req);
      return chooseMatch(deps.db, m, params.id, params.studentId, body.action, now());
    },
  );

  route(
    r,
    {
      method: 'patch',
      path: '/api/family/join-requests/:id',
      summary: 'Approve or decline a request to join with a diary login (admin)',
      tags: ['family'],
      access: admin,
      params: z.object({ id }),
      body: z.object({ approve: z.boolean() }),
      status: 204,
      response: null,
      errors: { 404: 'No such request' },
    },
    async (req, { params, body }) => {
      const m = memberOf(req);
      await decideJoin(deps.db, m, params.id, body.approve, deps.credentialsKey, now());
    },
  );

  route(
    r,
    {
      method: 'put',
      path: '/api/family/accounts/:id/password',
      summary: "A diary login's new password (admin); checked at the next allowed login",
      tags: ['family'],
      access: admin,
      params: z.object({ id }),
      body: z.object({ password: z.string().min(1).max(500) }),
      status: 204,
      response: null,
      errors: { 404: 'No such diary account' },
    },
    async (req, { params, body }) => {
      const m = memberOf(req);
      const [account] = await deps.db
        .select()
        .from(diaryAccounts)
        .where(and(eq(diaryAccounts.id, params.id), eq(diaryAccounts.familyId, m.familyId)));
      if (!account) throw new HttpError(404, 'not_found', 'No such diary account');
      const manifest = getProvider(account.providerId)?.manifest;
      const passwordField = manifest?.auth.fields.find((f) => f.type === 'password')?.key ?? 'password';
      const loginField = manifest?.auth.fields.find((f) => f.type !== 'password')?.key ?? 'login';
      // a changed credentials row is what lets an account that needed action try again (design.md 10.4)
      await deps.db
        .update(diaryAccounts)
        .set({
          credentialsEnc: encryptCredentials(
            { [loginField]: account.label, [passwordField]: body.password },
            m.familyId,
            deps.credentialsKey,
          ),
          status: 'ok',
          requiresAction: null,
          alertedAt: null,
        })
        .where(eq(diaryAccounts.id, account.id));
    },
  );

  route(
    r,
    {
      method: 'patch',
      path: '/api/family/students/:id',
      summary: "The family's numbers for one child, on the child's scale (design.md 6.4)",
      tags: ['family'],
      access: adults,
      params: z.object({ id }),
      body: z.object({
        settings: z.object({
          lowMark: z.number().nullable().optional(),
          dropStep: z.number().positive().nullable().optional(),
          callAfter: z.number().int().min(1).max(20).nullable().optional(),
        }),
      }),
      status: 204,
      response: null,
      errors: { 400: "A value outside the child's scale", 404: 'No such child in this family' },
    },
    async (req, { params, body }) => {
      const m = memberOf(req);
      const link = and(eq(familyStudents.familyId, m.familyId), eq(familyStudents.studentId, params.id));
      const [row] = await deps.db.select().from(familyStudents).where(link);
      if (!row) throw new HttpError(404, 'not_found', 'No such child in this family');
      const scale = await studentScale(deps.db, params.id);
      const s = body.settings;
      if (s.lowMark != null && (!scale || s.lowMark < scale.min || s.lowMark > scale.max))
        throw new HttpError(400, 'out_of_scale', "The value is outside the child's scale");
      const settings = { ...row.settings };
      const put = (key: 'low_mark' | 'drop_step' | 'call_after', v: number | null | undefined) => {
        if (v === undefined) return;
        if (v === null) delete settings[key];
        else settings[key] = v;
      };
      put('low_mark', s.lowMark);
      put('drop_step', s.dropStep);
      put('call_after', s.callAfter);
      await deps.db.update(familyStudents).set({ settings }).where(link);
    },
  );

  route(
    r,
    {
      method: 'delete',
      path: '/api/family/students/:id',
      summary: '«Перестать следить» (admin): stopped while a login of the family shows the child, else removed',
      tags: ['family'],
      access: admin,
      params: z.object({ id }),
      response: z.object({ outcome: z.enum(['stopped', 'removed']) }),
      errors: { 404: 'This family does not follow the child' },
    },
    async (req, { params }) => ({ outcome: await stopFollowing(deps.db, memberOf(req).familyId, params.id) }),
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/family/students/:id/follow',
      summary: '«Следить снова» (admin): a stopped child is followed again, with the whole history',
      tags: ['family'],
      access: admin,
      params: z.object({ id }),
      status: 204,
      response: null,
      errors: { 404: 'This child is not stopped in this family' },
    },
    async (req, { params }) => followAgain(deps.db, memberOf(req).familyId, params.id, now()),
  );

  route(
    r,
    {
      method: 'delete',
      path: '/api/family/students/:id/data',
      summary: '«Удалить данные» of a stopped child (admin), only when no other family follows them',
      tags: ['family'],
      access: admin,
      params: z.object({ id }),
      body: z.object({ confirm: z.string() }),
      status: 204,
      response: null,
      errors: { 400: 'The typed name does not match', 409: 'Not stopped, or another family follows the child' },
    },
    async (req, { params, body }) => deleteChildData(deps.db, memberOf(req).familyId, params.id, body.confirm),
  );

  route(
    r,
    {
      method: 'post',
      path: '/api/family/invites',
      summary: 'Invite a member: a 6-character code and a link, 48 hours, single use',
      tags: ['family'],
      access: adults,
      status: 201,
      body: z.object({ role, studentIds: z.array(id).default([]) }),
      response: z.object({ code: z.string(), url: z.string(), expiresAt: z.date() }),
      errors: { 403: 'Parents may not invite in this family', 404: 'No such child' },
    },
    async (req, { body }) => {
      const m = memberOf(req);
      await mayInvite(deps.db, m.familyId, m.role);
      if (m.role !== 'admin' && body.role === 'admin')
        throw new HttpError(403, 'forbidden', 'Only an admin invites an admin');
      return createInvite(deps.db, m, body.role, body.studentIds, now(), deps.secret);
    },
  );

  route(
    r,
    {
      method: 'patch',
      path: '/api/family/members/:id',
      summary: "A member's role and the children they see (admin)",
      tags: ['family'],
      access: admin,
      params: z.object({ id }),
      body: z.object({ role: role.optional(), studentIds: z.array(id).optional() }),
      status: 204,
      response: null,
      errors: { 404: 'No such member or child', 409: 'The family needs another admin first' },
    },
    async (req, { params, body }) => changeMember(deps.db, memberOf(req).familyId, params.id, body),
  );

  route(
    r,
    {
      method: 'delete',
      path: '/api/family/members/:id',
      summary: 'Remove a member (admin), or leave the family (yourself)',
      tags: ['family'],
      access: 'member',
      params: z.object({ id }),
      status: 204,
      response: null,
      errors: { 403: 'Only the admin removes others', 409: 'The family needs another admin first' },
    },
    async (req, { params }) => {
      const m = memberOf(req);
      if (params.id !== m.userId && m.role !== 'admin')
        throw new HttpError(403, 'forbidden', 'Only the admin removes others');
      await removeMember(deps.db, m.familyId, params.id);
    },
  );

  route(
    r,
    {
      method: 'get',
      path: '/api/family/export',
      summary: 'Everything the family owns and the data of the children it follows, as JSON (admin)',
      tags: ['family'],
      access: admin,
      response: z.record(z.string(), z.unknown()),
    },
    async (req) => exportFamily(deps.db, memberOf(req).familyId),
  );

  route(
    r,
    {
      method: 'patch',
      path: '/api/family',
      summary: 'The family’s switches (admin): «Подсказки» for everyone, whether parents may invite',
      tags: ['family'],
      access: admin,
      body: z.object({ guidance: z.boolean().optional(), parentsCanInvite: z.boolean().optional() }),
      response: familyView,
    },
    async (req, { body }) => {
      const m = memberOf(req);
      const [f] = await deps.db
        .select({ settings: families.settings })
        .from(families)
        .where(eq(families.id, m.familyId));
      const settings: FamilySettings = {
        ...(f?.settings ?? {}),
        ...(body.guidance !== undefined && { guidance: body.guidance }),
        ...(body.parentsCanInvite !== undefined && { parents_can_invite: body.parentsCanInvite }),
      };
      await deps.db.update(families).set({ settings }).where(eq(families.id, m.familyId));
      return viewFamily(deps.db, m.familyId, m.role);
    },
  );

  route(
    r,
    {
      method: 'delete',
      path: '/api/family',
      summary: 'Erase the family (admin, typed confirmation: the family name)',
      tags: ['family'],
      access: admin,
      body: z.object({ confirm: z.string() }),
      status: 204,
      response: null,
      errors: { 400: 'The typed name does not match' },
    },
    async (req, { body }) => eraseFamily(deps.db, memberOf(req).familyId, body.confirm),
  );

  return r;
}
