import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, ts } from './columns';

// Families, people, children and diary accounts (docs/design.md 7.1, 8). The family is the tenant: family-owned rows
// carry family_id. A child is not owned by a family: the child's diary and own work hang off students and are reached
// only through an active family_students link (server/src/access.ts).

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export interface FamilySettings {
  parents_can_invite?: boolean;
  guidance?: boolean;
  retention_years?: number | null;
  /** Extra days without school (ISO dates), on top of the provider's holidays */
  no_school_dates?: string[];
}

/** The family's number rules for one child, on that child's scale (design.md 6.4, family_students.settings) */
export interface ChildSettings {
  low_mark?: number;
  drop_step?: number;
  call_after?: number;
}

export const families = pgTable('families', {
  id: id(),
  name: text('name').notNull(),
  createdAt: createdAt(),
  settings: jsonb('settings').$type<FamilySettings>().notNull().default({}),
  consentVersion: text('consent_version'),
  consentAt: ts('consent_at'),
  consentBy: uuid('consent_by'),
});

export const users = pgTable(
  'users',
  {
    id: id(),
    login: text('login').notNull(),
    displayName: text('display_name').notNull(),
    locale: text('locale').notNull().default('ru'),
    uiMode: text('ui_mode', { enum: ['full', 'simple'] })
      .notNull()
      .default('full'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    avatar: jsonb('avatar').$type<Record<string, unknown>>(),
    passwordHash: text('password_hash').notNull(),
    /** IANA zone for notification times; two families of one child may live apart */
    timezone: text('timezone'),
    createdAt: createdAt(),
    lastLoginAt: ts('last_login_at'),
  },
  (t) => [uniqueIndex('users_login_key').on(sql`lower(${t.login})`)],
);

/** A person's role in one family; one login, possibly several families (design.md 7.1) */
export const memberships = pgTable(
  'memberships',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'parent', 'student'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.familyId] }), index('memberships_family_idx').on(t.familyId)],
);

export const userFiles = pgTable('user_files', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['wallpaper'] }).notNull(),
  mime: text('mime').notNull(),
  bytes: integer('bytes').notNull(),
  width: integer('width'),
  height: integer('height'),
  storageKey: text('storage_key').notNull(),
  createdAt: createdAt(),
});

/**
 * A signed-in browser (design.md 7.2 step 5). The cookie holds a random token; only its SHA-256 is stored, so a
 * database dump gives no live session. The current family of a person in several families lives here.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    tokenHash: text('token_hash').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id').references(() => families.id, { onDelete: 'set null' }),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
    userAgent: text('user_agent'),
  },
  (t) => [
    uniqueIndex('sessions_token_key').on(t.tokenHash),
    index('sessions_user_idx').on(t.userId),
    index('sessions_expires_idx').on(t.expiresAt),
  ],
);

export const diaryAccounts = pgTable(
  'diary_accounts',
  {
    id: id(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    providerId: text('provider_id').notNull(),
    tenant: jsonb('tenant').$type<Record<string, string> | null>(),
    role: text('role', { enum: ['parent', 'student'] }).notNull(),
    /** The login or e-mail shown in the UI */
    label: text('label').notNull(),
    /** Encrypted JSON of the manifest's auth fields (server/src/crypto/credentials.ts); never logged, never returned */
    credentialsEnc: bytea('credentials_enc'),
    externalUserId: text('external_user_id'),
    status: text('status', { enum: ['ok', 'auth_failed', 'blocked', 'needs_2fa'] })
      .notNull()
      .default('ok'),
    lastOkAt: ts('last_ok_at'),
    lastLoginAt: ts('last_login_at'),
    lastError: text('last_error'),
    // planner state (docs/design.md 10.4)
    consecutiveFailures: integer('consecutive_failures').notNull().default(0),
    pausedUntil: ts('paused_until'),
    /** Length of the current pause; doubles after a failed run that follows a pause, reset by a success */
    pauseHours: integer('pause_hours'),
    requiresAction: text('requires_action', { enum: ['auth', 'blocked', 'needs_2fa'] }),
    lastAttemptAt: ts('last_attempt_at'),
    lastSuccessAt: ts('last_success_at'),
    /** The admin was told about the current pause or required action; cleared when the account recovers */
    alertedAt: ts('alerted_at'),
    createdAt: createdAt(),
  },
  (t) => [
    index('diary_accounts_family_idx').on(t.familyId),
    // one row per diary login: a login connected twice (a double tap, two parents at once) is refused by the database
    uniqueIndex('diary_accounts_external_user_key').on(t.providerId, t.externalUserId),
  ],
);

export const students = pgTable(
  'students',
  {
    id: id(),
    providerId: text('provider_id').notNull(),
    externalId: text('external_id').notNull(),
    fullName: text('full_name').notNull(),
    givenName: text('given_name'),
    familyName: text('family_name'),
    displayName: text('display_name'),
    schoolId: text('school_id'),
    /** The provider's class id, when its URLs need it (StudentRef.classExternalId) */
    classExternalId: text('class_external_id'),
    classLabel: text('class_label'),
    grade: integer('grade'),
    gradeLabel: text('grade_label'),
    /** The current school year's scale; null = a year without marks (ux-principles D49) */
    gradingScaleId: text('grading_scale_id'),
    /** The school's IANA zone (lesson dates, the sync window); null = the manifest's */
    timezone: text('timezone'),
    /** The school's name when the provider gives one (StudentRef.schoolName) */
    schoolLabel: text('school_label'),
    isActive: boolean('is_active').notNull().default(true),
    avatar: jsonb('avatar').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [unique('students_provider_external_key').on(t.providerId, t.externalId)],
);

/** Cross-family lookup at connect: the same child seen through another family's account (docs/design.md 7.2) */
export const studentIdentities = pgTable(
  'student_identities',
  {
    providerId: text('provider_id').notNull(),
    externalId: text('external_id').notNull(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.providerId, t.externalId, t.studentId] }),
    // one child per id in a system: the second parent's login finds the same child (design.md 7.2)
    unique('student_identities_provider_external_key').on(t.providerId, t.externalId),
  ],
);

export const joinRequests = pgTable('join_requests', {
  id: id(),
  familyId: uuid('family_id')
    .notNull()
    .references(() => families.id, { onDelete: 'cascade' }),
  fromUserId: uuid('from_user_id').references(() => users.id, { onDelete: 'cascade' }),
  diaryAccountId: uuid('diary_account_id').references(() => diaryAccounts.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'approved', 'declined'] })
    .notNull()
    .default('pending'),
  createdAt: createdAt(),
  decidedBy: uuid('decided_by').references(() => users.id, { onDelete: 'set null' }),
});

/** A one-time code to join a family (design.md 7.3); `code` is the SHA-256 of the code, never the code itself */
export const invites = pgTable('invites', {
  code: text('code').primaryKey(),
  familyId: uuid('family_id')
    .notNull()
    .references(() => families.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['admin', 'parent', 'student'] }).notNull(),
  studentIds: uuid('student_ids').array().notNull().default([]),
  expiresAt: ts('expires_at').notNull(),
  usedBy: uuid('used_by').references(() => users.id, { onDelete: 'set null' }),
  usedAt: ts('used_at'),
});

/** The children a family follows (design.md 7.1); active only while one of its own diary accounts shows the child */
export const familyStudents = pgTable(
  'family_students',
  {
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** stopped: "Stop following" (family.child.stop) while a login of the family still shows the child (design.md 7.1) */
    status: text('status', { enum: ['active', 'suspended', 'stopped'] })
      .notNull()
      .default('active'),
    settings: jsonb('settings').$type<ChildSettings>().notNull().default({}),
    linkedAt: ts('linked_at').notNull().defaultNow(),
    linkedBy: uuid('linked_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [primaryKey({ columns: [t.familyId, t.studentId] }), index('family_students_student_idx').on(t.studentId)],
);

/** Every diary account that shows a child; the collector reads the child through the active one only (design.md 10.2) */
export const studentSources = pgTable(
  'student_sources',
  {
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    diaryAccountId: uuid('diary_account_id')
      .notNull()
      .references(() => diaryAccounts.id, { onDelete: 'cascade' }),
    /** The child's id as this account's system knows it */
    externalId: text('external_id').notNull(),
    /** The last getAccount() of this account that listed the child */
    lastSeenAt: ts('last_seen_at'),
    active: boolean('active').notNull().default(false),
  },
  (t) => [
    primaryKey({ columns: [t.studentId, t.diaryAccountId] }),
    index('student_sources_account_idx').on(t.diaryAccountId),
    uniqueIndex('student_sources_one_active')
      .on(t.studentId)
      .where(sql`${t.active}`),
  ],
);

export const userStudentAccess = pgTable(
  'user_student_access',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
  },
  // which of a family's children a member sees, inside that family
  (t) => [primaryKey({ columns: [t.userId, t.familyId, t.studentId] })],
);
