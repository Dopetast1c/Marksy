import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initEnv } from '../src/ops/init-env';

// `pnpm env:prod --out <file> [--credentials-key-from .env] [--tz <zone>]`: the production settings file on the
// development computer, the same as `marksy init-env` in the server image (docs/running.md, secrets). With
// --credentials-key-from it takes CREDENTIALS_KEY from that file, so the diary passwords stored in a copied
// development database stay readable. Prints key names only; it reads the other file but shows nothing of it.

const args = process.argv.slice(2);
const opt = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const out = opt('--out');
const repo = fileURLToPath(new URL('../..', import.meta.url));
if (!out || !isAbsolute(out)) {
  console.error(
    'env:prod needs an absolute file outside the repository: pnpm env:prod --out D:\\marksy-secrets\\.env.production',
  );
  process.exit(2);
}
if (resolve(out).toLowerCase().startsWith(resolve(repo).toLowerCase())) {
  console.error('the production settings must not be written inside the repository: choose a folder elsewhere');
  process.exit(2);
}
const from = opt('--credentials-key-from');
const result = initEnv({
  template: readFileSync(new URL('../../env.example', import.meta.url), 'utf8'),
  existing: existsSync(out) ? readFileSync(out, 'utf8') : null,
  credentialsFrom: from ? readFileSync(resolve(repo, from), 'utf8') : null,
  ...(opt('--tz') && { tz: opt('--tz')! }),
});
writeFileSync(out, result.text, { mode: 0o600 });
console.log(`${out}: ${result.added.length} keys added, ${result.kept.length} secrets kept as they were`);
if (result.generated.length) console.log(`generated: ${result.generated.join(', ')}`);
if (result.copied.length) console.log(`copied from ${from}: ${result.copied.join(', ')}`);
// a fixed hint, no value of the file
const KEEP_IT = [
  'Keep this file in your password manager next to the backups: without CREDENTIALS_KEY the stored diary',
  'passwords cannot be read. Move it to the host through the password manager, not with the dump.',
];
for (const line of KEEP_IT) console.log(line);
