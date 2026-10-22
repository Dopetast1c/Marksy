import { providerManifest } from './manifest';
import type { ProviderManifest } from './manifest';
import type { DiaryProvider } from './types';

// The registry logic. Which providers exist is decided in packages/registry, which imports every folder under
// providers/; core itself never imports a provider (docs/build-plan.md, M1).

export interface ProviderRegistry {
  /** Any registered provider, whatever its status; undefined when unknown. */
  get(id: string): DiaryProvider | undefined;
  /** Providers offered to users: status stable or beta. `all` adds experimental and broken ones. */
  list(options?: { all?: boolean }): DiaryProvider[];
}

const OFFERED: ReadonlySet<ProviderManifest['status']> = new Set(['stable', 'beta']);

export function createRegistry(providers: readonly DiaryProvider[]): ProviderRegistry {
  const byId = new Map<string, DiaryProvider>();
  for (const p of providers) {
    const parsed = providerManifest.safeParse(p.manifest);
    if (!parsed.success) throw new Error(`Provider manifest ${p.manifest.id} is invalid: ${parsed.error.message}`);
    if (byId.has(p.manifest.id)) throw new Error(`Provider ${p.manifest.id} is registered twice`);
    byId.set(p.manifest.id, p);
  }
  return {
    get: (id) => byId.get(id),
    list: (options) => [...byId.values()].filter((p) => options?.all || OFFERED.has(p.manifest.status)),
  };
}
