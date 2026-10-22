import { createRegistry } from '@marksy/core';
import { byEschools } from '@marksy/provider-by-eschools';
import { demoMinimal } from '@marksy/provider-demo-minimal';

// Every provider Marksy knows. A new provider is a folder under providers/ plus one line here (docs/providers.md 2).
// Core holds the registry logic and never imports a provider; the server and the scripts import this package.
export const registry = createRegistry([byEschools, demoMinimal]);

export const getProvider = (id: string) => registry.get(id);
export const listProviders = (options?: { all?: boolean }) => registry.list(options);
