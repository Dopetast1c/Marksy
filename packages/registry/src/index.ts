import { createRegistry } from '@marksy/core';
import { byEschools } from '@marksy/provider-by-eschools';
import { demoFull } from '@marksy/provider-demo-full';
import { demoLite } from '@marksy/provider-demo-lite';
import { demoMinimal } from '@marksy/provider-demo-minimal';

// Every provider Marksy knows. A new provider is a folder under providers/ plus one line here (docs/providers.md 2).
// Core holds the registry logic and never imports a provider; the server and the scripts import this package.
export const registry = createRegistry([byEschools, demoMinimal, demoFull, demoLite]);

export const getProvider = (id: string) => registry.get(id);
export const listProviders = (options?: { all?: boolean }) => registry.list(options);

// The fictional providers answer from their fixtures: collector tests and the seed reach them through this package too.
export { DEMO_FULL_FIXTURES, demoFullTransport } from '@marksy/provider-demo-full';
export { demoLiteTransport } from '@marksy/provider-demo-lite';
export { demoTransport } from '@marksy/provider-demo-minimal';
