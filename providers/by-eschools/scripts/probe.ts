// pnpm probe: one real read of the owner's account from a Belarusian IP (docs/build-plan.md M2, M3a; CLAUDE.md "Real
// diary runs"). scripts/probe.mjs asks the login guard first (one login an hour; Claude Code's cap and hours); this
// script logs in with DIARY_LOGIN and DIARY_PASSWORD from .env and does one run of src/probe-run.ts over the network.
// Importing it starts a real login: never import it, and never run it but through `pnpm probe`. The same run on saved
// responses, without a login: `pnpm probe --offline` (scripts/probe-offline.ts).

import { fileURLToPath } from 'node:url';
import { fetchTransport, ProviderError } from '@marksy/core';
import { MAX_WEEKS, weeksArg } from '../src/probe';
import { runProbe } from '../src/probe-run';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));

async function main(): Promise<number> {
  // checked before anything touches the network
  const weeks = weeksArg(process.argv.slice(2));
  if (weeks === null) {
    console.error(`--weeks takes a whole number from 1 to ${MAX_WEEKS}.`);
    return 2;
  }
  const login = process.env.DIARY_LOGIN;
  const password = process.env.DIARY_PASSWORD;
  if (!login || !password) {
    console.error('Set DIARY_LOGIN and DIARY_PASSWORD in .env (see .env.example), then run pnpm probe again.');
    return 2;
  }
  return runProbe({
    transport: fetchTransport,
    credentials: { login, password },
    clock: () => new Date(),
    weeks,
    root,
    fixturesDir,
    saveRaw: true,
    out: (line) => console.log(line),
    err: (line) => console.error(line),
  });
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    // the error class only: messages may carry server text
    const kind = err instanceof ProviderError ? err.name : err instanceof Error ? err.name : 'Error';
    console.error(`Probe stopped: ${kind}.`);
    if (kind === 'ProviderAuthError')
      console.error('The diary rejected the login. Check DIARY_LOGIN and DIARY_PASSWORD; do not retry in a loop.');
    if (kind === 'ProviderUnavailableError' || kind === 'TypeError')
      console.error(
        'No answer or 5xx: is a VPN on? Requests must leave from a Belarusian IP without VPN (docs/api-spec.md 9.1).',
      );
    process.exit(1);
  },
);
