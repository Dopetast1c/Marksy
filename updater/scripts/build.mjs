#!/usr/bin/env node
// `pnpm --filter @marksy/updater build`: the updater image's program (updater/Dockerfile), one ESM bundle with no
// dependency outside Node itself, dist/marksy-updater.mjs.
import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: { 'marksy-updater': `${root}src/main.ts` },
  outdir: dist,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  legalComments: 'none',
  logLevel: 'warning',
});
console.log('dist/marksy-updater.mjs');
