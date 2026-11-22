import type { MemoKind, MemoStore } from '@marksy/core';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/client';
import { providerMemo } from '../db/schema';

// ctx.memo's store (docs/providers.md 4): a provider's own reference data per diary account, kept between runs and
// read again when the collector reads its kind (design.md 10.2).

export function memoStore(db: Db, accountId: string, refresh: ReadonlySet<MemoKind>, now: () => Date): MemoStore {
  return {
    refresh,
    async load(key) {
      const [row] = await db
        .select({ kind: providerMemo.kind, value: providerMemo.value })
        .from(providerMemo)
        .where(and(eq(providerMemo.diaryAccountId, accountId), eq(providerMemo.key, key)));
      return row ?? null;
    },
    async save(kind, key, value) {
      // nothing to keep (a provider returned nothing): the next run asks again
      if (value === undefined || value === null) return;
      const at = now();
      await db
        .insert(providerMemo)
        .values({ diaryAccountId: accountId, key, kind, value, fetchedAt: at })
        .onConflictDoUpdate({
          target: [providerMemo.diaryAccountId, providerMemo.key],
          set: { kind, value, fetchedAt: at },
        });
    },
  };
}
