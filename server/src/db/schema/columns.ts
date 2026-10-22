import { date, timestamp, uuid } from 'drizzle-orm/pg-core';

// Column helpers shared by every table (docs/design.md 8): a Marksy uuid key, timestamptz everywhere, school-local
// days as plain `date` strings so no time zone can move a lesson to another day.

export const id = () => uuid('id').primaryKey().defaultRandom();
export const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
export const createdAt = () => ts('created_at').notNull().defaultNow();
export const day = (name: string) => date(name, { mode: 'string' });
