#!/usr/bin/env node
// `pnpm --filter @marksy/server build`: the server image's program (server/Dockerfile). One ESM bundle of the server
// and every workspace package it uses, dist/marksy.mjs, plus dist/package.json naming the few packages that stay
// outside it: argon2's native binary (installed for the image's own architecture) and Swagger UI, which serves its
// files from its package folder. No test, fixture folder or source map goes into dist.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = `${root}dist`;
const EXTERNAL = ['@node-rs/argon2', 'swagger-ui-express'];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

await build({
  entryPoints: { marksy: `${root}src/cli/entry.ts` },
  outdir: dist,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // pg's optional native binding is never used
  external: [...EXTERNAL, 'pg-native'],
  legalComments: 'none',
  logLevel: 'warning',
  // CommonJS packages inside an ES module bundle still call require and read __dirname
  banner: {
    js: [
      "import { createRequire as __marksyRequire } from 'node:module';",
      "import { fileURLToPath as __marksyPath } from 'node:url';",
      'const require = __marksyRequire(import.meta.url);',
      'const __filename = __marksyPath(import.meta.url);',
      "const __dirname = __marksyPath(new URL('.', import.meta.url));",
    ].join('\n'),
  },
});

const require = createRequire(`${root}package.json`);
const versionOf = (name) => JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')).version;
writeFileSync(
  `${dist}/package.json`,
  `${JSON.stringify(
    {
      name: 'marksy-server-runtime',
      private: true,
      type: 'module',
      license: 'PolyForm-Noncommercial-1.0.0',
      dependencies: Object.fromEntries(EXTERNAL.map((name) => [name, versionOf(name)])),
    },
    null,
    2,
  )}\n`,
);
console.log(`dist/marksy.mjs and dist/package.json (${EXTERNAL.join(', ')} outside the bundle)`);
