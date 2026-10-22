import { boolean, index, jsonb, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, ts } from './columns';
import { students, users } from './family';

// Notifications (docs/design.md 11). The tables exist from M3 so the collector can leave the admin a note about a
// pause or a drift event; delivery over Web Push and Telegram comes with M9.

export const notificationChannels = pgTable('notification_channels', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['webpush', 'telegram'] }).notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: createdAt(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** null = family-wide */
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id'),
    /** What fact it was about, for "пришло" on Внимание and for deduplication */
    eventKey: text('event_key').notNull(),
    severity: text('severity').notNull(),
    /** i18n keys and their parameters; the text is rendered in the reader's language */
    title: text('title').notNull(),
    body: text('body'),
    params: jsonb('params').$type<Record<string, string | number>>(),
    link: text('link'),
    channels: text('channels').array().notNull().default([]),
    createdAt: createdAt(),
    sentAt: ts('sent_at'),
    readAt: ts('read_at'),
  },
  (t) => [
    index('notifications_user_created_idx').on(t.userId, t.createdAt),
    index('notifications_event_idx').on(t.userId, t.eventKey),
  ],
);

export const alertRules = pgTable('alert_rules', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  event: text('event', { enum: ['mark', 'average', 'changed', 'absence', 'tag', 'homework', 'summary'] }).notNull(),
  condition: jsonb('condition').$type<Record<string, unknown>>().notNull().default({}),
  scope: jsonb('scope').$type<Record<string, unknown>>().notNull().default({}),
  when: text('when', { enum: ['now', 'evening', 'weekly'] })
    .notNull()
    .default('now'),
  channel: text('channel', { enum: ['all', 'push', 'telegram'] })
    .notNull()
    .default('all'),
  enabled: boolean('enabled').notNull().default(true),
  updatedAt: ts('updated_at').notNull().defaultNow(),
});

export const telegramLinkCodes = pgTable('telegram_link_codes', {
  code: text('code').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: ts('expires_at').notNull(),
});

/** Powers "new since last visit" */
export const userSeen = pgTable(
  'user_seen',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    lastSeenAt: ts('last_seen_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.studentId] })],
);
