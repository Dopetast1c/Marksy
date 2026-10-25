import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { providerManifest } from '@marksy/core';
import type { ProviderManifest } from '@marksy/core';
import type { Db } from '../db/client';
import { diaryAccounts } from '../db/schema';
import type { SyncConfig } from './config';
import { accountPlan } from './account-plan';
import { formatWindow } from './window';

// `pnpm sync:plan` (docs/build-plan.md M3a): what the planner would do now, for every diary account, without logging
// in anywhere. It must never be able to reach a diary: it reads the manifests as JSON instead of loading providers, and
// a test checks its import graph (plan-report.test.ts). Output is ids, times and counts only, never names or data.

/** The manifests of every provider, read from providers/<id>/provider.json: data only, no provider code */
export function loadManifests(providersDir: string): Map<string, ProviderManifest> {
  const out = new Map<string, ProviderManifest>();
  for (const dir of readdirSync(providersDir)) {
    const file = join(providersDir, dir, 'provider.json');
    if (dir.startsWith('_') || !existsSync(file)) continue;
    const manifest = providerManifest.parse(JSON.parse(readFileSync(file, 'utf8')));
    out.set(manifest.id, manifest);
  }
  return out;
}

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export async function planReport(
  db: Db,
  manifests: ReadonlyMap<string, ProviderManifest>,
  config: SyncConfig,
  now: Date,
): Promise<string[]> {
  const lines: string[] = [];
  const accounts = await db.select().from(diaryAccounts).orderBy(diaryAccounts.createdAt);
  if (accounts.length === 0) return ['no diary accounts'];
  for (const account of accounts) {
    const manifest = manifests.get(account.providerId);
    if (!manifest) {
      lines.push(`account ${account.id}: provider ${account.providerId} not found`);
      continue;
    }
    const { local, sourceCheck, readable, sourced, today, decision } = await accountPlan(
      db,
      account,
      manifest,
      config,
      now,
    );

    lines.push(
      `account ${account.id} (${account.providerId}): ${sourceCheck ? `source check of ${sourced.length} children` : `reads ${readable.length} children`}, status ${account.status}${account.requiresAction ? `, needs ${account.requiresAction}` : ''}, last success ${account.lastSuccessAt?.toISOString() ?? 'never'}`,
    );
    for (const c of today.children) {
      const w = c.window.window
        ? `${formatWindow(c.window.window)} (${c.window.source})`
        : `no window (${c.window.source})`;
      const sets = Object.entries(c.sets)
        .map(([k, n]) => `${k} ${n}`)
        .join(', ');
      lines.push(`  child ${c.studentId}: today ${local.date} ${w}; weeks waiting: ${sets || 'none stored yet'}`);
    }
    lines.push(`  account window today: ${today.windows.map(formatWindow).join(', ') || 'none'}`);
    const at = `${local.date} ${hhmm(local.minutes)}`;
    lines.push(
      decision.start
        ? `  now ${at}: would start, kind ${sourceCheck ? 'source_check' : decision.kind}`
        : `  now ${at}: not now (${decision.reason})${decision.retryAt ? `, next login allowed at ${decision.retryAt.toISOString()}` : ''}`,
    );
  }
  return lines;
}
