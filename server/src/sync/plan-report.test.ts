import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoFullTransport } from '@marksy/registry';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../../test/db';
import { createAccount, TEST_CREDENTIALS_KEY } from '../../test/factories';
import { readSyncConfig } from './config';
import { loadManifests, planReport } from './plan-report';
import { runSync } from './run';

const db = testDb();
const here = dirname(fileURLToPath(import.meta.url));
const PROVIDERS = resolve(here, '../../../providers');

/** Every module pnpm sync:plan loads at runtime (type-only imports are erased and never load) */
function runtimeImports(entry: string, seen = new Set<string>(), packages = new Set<string>()) {
  if (seen.has(entry)) return { seen, packages };
  seen.add(entry);
  const source = readFileSync(entry, 'utf8');
  for (const m of source.matchAll(/^\s*(import|export)\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)) {
    const spec = m[2]!;
    if (spec.startsWith('.')) {
      const base = resolve(dirname(entry), spec);
      runtimeImports(existsSync(`${base}.ts`) ? `${base}.ts` : resolve(base, 'index.ts'), seen, packages);
    } else packages.add(spec);
  }
  return { seen, packages };
}

describe('pnpm sync:plan', () => {
  beforeEach(() => resetDb(db));

  it('cannot log in: nothing it loads knows a provider, the collector or a run', () => {
    const { seen, packages } = runtimeImports(resolve(here, '../../scripts/sync-plan.ts'));
    const modules = [...seen].map((f) => f.replace(/\\/g, '/'));
    for (const forbidden of ['/collector.ts', '/run.ts', '/once.ts', '/scheduler.ts']) {
      expect(
        modules.filter((m) => m.endsWith(forbidden)),
        forbidden,
      ).toEqual([]);
    }
    const external = [...packages];
    expect(
      external.filter(
        (p) => p === '@marksy/registry' || p === '@marksy/demo-diary' || p.startsWith('@marksy/provider-'),
      ),
    ).toEqual([]);
    // and the module itself really is in the graph
    expect(modules.some((m) => m.endsWith('/plan-report.ts'))).toBe(true);
  });

  it('prints ids, times and counts per account and child, never a name', async () => {
    const { account } = await createAccount(db, 'demo-full');
    await runSync({
      db,
      accountId: account.id,
      trigger: 'schedule',
      config: readSyncConfig({}),
      now: () => new Date('2025-09-16T05:00:00Z'),
      transport: demoFullTransport(),
      sleep: async () => undefined,
      online: async () => true,
      credentialsKey: TEST_CREDENTIALS_KEY,
    });
    // Tuesday 16 Sep, 10:00 in the demo's time zone: p-1 has lessons 1 and 2, p-2 none that day
    const lines = await planReport(db, loadManifests(PROVIDERS), readSyncConfig({}), new Date('2025-09-16T07:00:00Z'));
    const text = lines.join('\n');
    expect(text).toContain(`account ${account.id} (demo-full): reads 2 children`);
    expect(text).toMatch(/today 2025-09-16 07:30–11:40 \(timetable\)/);
    expect(text).toMatch(/no window \(no_lessons\)/);
    expect(text).toContain('account window today: 07:30–11:40');
    expect(text).not.toMatch(/Пример|Ученик|Алгебра|parent@example\.com/);
  });
});
