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

// Families, people and diary accounts (docs/design.md 7, 8). The family is the tenant: every family-owned row carries
// family_id and every query is scoped by it.

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export interface FamilySettings {
  parents_can_invite?: boolean;
  sync_window?: string;
  guidance?: boolean;
  retention_years?: number | null;
  low_mark?: number;
  drop_step?: number;
  /** Extra days without school (ISO dates), on top of the provider's holidays */
  no_school_dates?: string[];
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
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['admin', 'parent', 'student'] }).notNull(),
    login: text('login').notNull(),
    displayName: text('display_name').notNull(),
    locale: text('locale').notNull().default('ru'),
    uiMode: text('ui_mode', { enum: ['full', 'simple'] })
      .notNull()
      .default('full'),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    avatar: jsonb('avatar').$type<Record<string, unknown>>(),
    passwordHash: text('password_hash').notNull(),
    createdAt: createdAt(),
    lastLoginAt: ts('last_login_at'),
  },
  (t) => [uniqueIndex('users_login_key').on(sql`lower(${t.login})`), index('users_family_idx').on(t.familyId)],
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

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
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
  (t) => [index('diary_accounts_family_idx').on(t.familyId)],
);

export const students = pgTable(
  'students',
  {
    id: id(),
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
    diaryAccountId: uuid('diary_account_id').references(() => diaryAccounts.id, { onDelete: 'cascade' }),
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
    isActive: boolean('is_active').notNull().default(true),
    avatar: jsonb('avatar').$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('students_family_provider_external_key').on(t.familyId, t.providerId, t.externalId),
    index('students_account_idx').on(t.diaryAccountId),
  ],
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
    familyId: uuid('family_id')
      .notNull()
      .references(() => families.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.externalId, t.studentId] })],
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

export const userStudentAccess = pgTable(
  'user_student_access',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.studentId] })],
);
