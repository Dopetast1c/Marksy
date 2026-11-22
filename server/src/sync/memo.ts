import type { MemoKind, MemoStore } from '@marksy/core';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { providerMemo, students } from '../db/schema';

// ctx.memo's store (docs/providers.md 4): a provider's own reference data per diary account, kept between runs and
// read again when the collector reads its kind (design.md 10.2). A child's own value (their class, their subjects)
// carries the child: it goes with the child (a cascade) and when the account no longer lists them (forgetMemoOf).

export function memoStore(
  db: Db,
  account: { id: string; providerId: string },
  refresh: ReadonlySet<MemoKind>,
  now: () => Date,
): MemoStore {
  return {
    refresh,
    async load(key) {
      const [row] = await db
        .select({ kind: providerMemo.kind, value: providerMemo.value })
        .from(providerMemo)
        .where(and(eq(providerMemo.diaryAccountId, account.id), eq(providerMemo.key, key)));
      return row ?? null;
    },
    async save(kind, key, value, student) {
      // nothing to keep (a provider returned nothing): the next run asks again
      if (value === undefined || value === null) return;
      // a value of a child not stored yet (the first read of the account) is kept on the next read
      let studentId: string | null = null;
      if (student !== undefined) {
        const [row] = await db
          .select({ id: students.id })
          .from(students)
          .where(and(eq(students.providerId, account.providerId), eq(students.externalId, student)));
        if (!row) return;
        studentId = row.id;
      }
      const at = now();
      await db
        .insert(providerMemo)
        .values({ diaryAccountId: account.id, key, kind, value, fetchedAt: at, studentId })
        .onConflictDoUpdate({
          target: [providerMemo.diaryAccountId, providerMemo.key],
          set: { kind, value, fetchedAt: at, studentId },
        });
    },
  };
}

/** The account no longer lists the child: what its provider kept of that child goes */
export async function forgetMemoOf(db: Db, accountId: string, studentId: string): Promise<void> {
  await db
    .delete(providerMemo)
    .where(and(eq(providerMemo.diaryAccountId, accountId), eq(providerMemo.studentId, studentId)));
}
