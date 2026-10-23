import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { memberships, notifications } from '../db/schema';

// Notes for the family's admins from the collector (docs/design.md 10.3, 10.4): a pause, a login the diary refused,
// a new kind of drift. They land in the inbox (notifications) as i18n keys with parameters, rendered in each reader's
// language; push and Telegram delivery comes with M9. One row per admin and event key, never twice.

export interface AdminNotice {
  /** What it is about, for deduplication: "sync:paused:<account>:<until>" */
  eventKey: string;
  severity: 'info' | 'warning' | 'critical';
  /** i18n keys (packages/i18n) */
  title: string;
  body: string;
  params?: Record<string, string | number>;
  link?: string;
}

export async function notifyAdmins(db: Db, familyId: string, notice: AdminNotice): Promise<number> {
  const admins = await db
    .select({ id: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.familyId, familyId), eq(memberships.role, 'admin')));
  let sent = 0;
  for (const admin of admins) {
    const [dup] = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.userId, admin.id), eq(notifications.eventKey, notice.eventKey)));
    if (dup) continue;
    await db.insert(notifications).values({
      userId: admin.id,
      eventKey: notice.eventKey,
      severity: notice.severity,
      title: notice.title,
      body: notice.body,
      params: notice.params ?? null,
      link: notice.link ?? '/sync',
    });
    sent++;
  }
  return sent;
}
