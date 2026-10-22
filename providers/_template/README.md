# Provider template

Copy this folder to start a provider for another diary system. The contract, the canonical types and the checklist are in [docs/providers.md](../../docs/providers.md); `providers/demo-minimal` is a complete small example.

1. `cp -r providers/_template providers/<country>-<system>` and rename the package in `package.json` to `@marksy/provider-<id>`.
2. Fill in `provider.json`: id, name, website, `network.baseUrl` (https origin), calendar, grading scale, capabilities, limits, the read-only allow-list of every request you make (GET, and POST only for the login) and `auth.loginRequest`.
3. Describe the system's API in this README, with a verification status per field.
4. Write raw schemas (`z.looseObject`), the mapper and the methods in `src/`, using only `ctx.http`.
5. Implement `sanitize()`, put sanitised fixtures in `fixtures/` and the strings and patterns that must never appear in them in `fixtures/denylist.json`. Add at least one invented, not real, unsanitised response to `fixtures/unsanitised/` with values from the denylist, so the suite can prove `sanitize()` removes them. Real responses stay in `raw/` folders, which git ignores.
6. Route each request to its fixture in `ROUTES`, run `MARKSY_UPDATE_EXPECTED=1 pnpm test:provider <id>` once, review `fixtures/expected/canonical.json`, then `pnpm test:provider <id>` until green.
7. Add the provider to `packages/registry` and set `status` to `beta`.
