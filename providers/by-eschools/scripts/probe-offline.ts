// pnpm probe --offline [run]: the probe on the saved raw responses of a run in data/probe/ (the newest, or the folder
// named), without a login: schemas, sanitize(), the drift checks, the deny-list and the fixture writing (CLAUDE.md
// "Real diary runs"). It reads no credentials and touches no network: the package script loads no .env, and the only
// transport is the replay of src/probe-replay.ts.

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findRun, loadRun, replayTransport } from '../src/probe-replay';
import { runProbe } from '../src/probe-run';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const fixturesDir = fileURLToPath(new URL('../fixtures', import.meta.url));

async function main(): Promise<number> {
  const name = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const dir = findRun(join(root, 'data', 'probe'), name);
  if (!dir) {
    console.error(name ? `no saved run ${name} in data/probe/` : 'no saved run in data/probe/: run pnpm probe once');
    return 2;
  }
  const run = loadRun(dir);
  const replay = replayTransport(run);
  console.log(`Offline: the run of ${run.startedAt.toISOString()}, ${run.files.size} saved responses.`);
  try {
    return await runProbe({
      transport: replay.transport,
      credentials: { login: 'offline', password: 'offline' },
      clock: () => run.startedAt,
      sleep: async () => undefined,
      weeks: run.weeks,
      root,
      fixturesDir,
      saveRaw: false,
      out: (line) => console.log(line),
      err: (line) => console.error(line),
    });
  } finally {
    if (replay.missing.length)
      console.error(`Not in the saved run (needs a real run): ${[...new Set(replay.missing)].join(', ')}`);
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(`Offline probe stopped: ${err instanceof Error ? err.name : 'Error'}.`);
    process.exit(1);
  },
);
