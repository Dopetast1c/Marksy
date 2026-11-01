import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_DATABASE_URL } from '../src/db/client';
import { containerTools } from '../src/ops/docker-tools';
import { takeBackup } from '../src/ops/backup';
import { appVersion } from '../src/runtime/version';
import { DEFAULT_UPLOADS_DIR } from '../src/uploads/store';

// `pnpm db:export --out <folder>`: the development database and its pictures as a production backup (docs/running.md,
// "From the development database"): pg_dump runs in the marksy-postgres container, the files land in <folder>, which
// must be outside the repository. Restored on the production host with `marksy restore <file> --without-demo`. Prints
// counts only.

const args = process.argv.slice(2);
const at = args.indexOf('--out');
const out = at >= 0 ? args[at + 1] : undefined;
const repo = fileURLToPath(new URL('../..', import.meta.url));
if (!out || !isAbsolute(out)) {
  console.error('db:export needs an absolute folder outside the repository: pnpm db:export --out D:\\marksy-transfer');
  process.exit(2);
}
if (resolve(out).toLowerCase().startsWith(resolve(repo).toLowerCase())) {
  console.error('the export must not go inside the repository: choose a folder elsewhere');
  process.exit(2);
}

const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
const version = appVersion();
const result = await takeBackup({
  databaseUrl,
  dir: out,
  folder: out,
  kind: 'export',
  version: version.version,
  commit: version.commit,
  uploadsDir: process.env.UPLOADS_DIR?.trim() || DEFAULT_UPLOADS_DIR,
  tool: containerTools('marksy-postgres'),
});
const rows = Object.values(result.manifest.tables).reduce((a, b) => a + b, 0);
console.log(
  `exported: ${Object.keys(result.manifest.tables).length} tables, ${rows} rows, ${result.manifest.uploads?.files ?? 0} pictures`,
);
console.log(
  `files: ${join(out, `${result.name}.dump`)} and its .json${result.manifest.uploads ? ' and .uploads.tar.gz' : ''}`,
);
console.log('');
console.log('Moving it (docs/running.md, "From the development database"):');
console.log(
  '- the dump and .env.production travel by different routes: .env.production through your password manager,',
);
console.log('  the dump by a cable, a network share or a USB stick, never both in one folder on one stick;');
console.log('- after the restore on the new host, delete the transfer folder on both computers.');
