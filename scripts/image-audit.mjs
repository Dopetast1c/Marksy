#!/usr/bin/env node
// `pnpm image:audit <image>`: what a built image carries, before it is pushed (the images are public; docs/running.md).
// It exports the image's file system and refuses:
// - an environment file, a database dump, a HAR export, a git folder, the local data folder;
// - the diary provider's fixtures or probe scripts, a test file;
// - a secret or a personal e-mail address in the app's own files (not in third-party packages);
// - when data/deny-list.json exists on this machine (built by the probe from the latest real responses), any of its
//   names or ids anywhere in the app's files;
// - an environment variable of the image that looks like a secret.
// Prints paths and reasons, never a matched value.
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { denyHits, loadDenyList } from './commit-guard.mjs';

const FORBIDDEN_PATHS = [
  { re: /(^|\/)\.env(?!\.example$)[^/]*$/, why: 'environment file' },
  { re: /\.(har|dump|sqlite3?|sql\.gz)$/i, why: 'dump or HAR export' },
  { re: /(^|\/)\.git\//, why: 'git folder' },
  { re: /^(app|srv|src)\/data\//, why: 'local data folder' },
  { re: /providers\/[^/]+\/(fixtures|scripts)\//, why: 'diary provider fixtures or probe scripts' },
  { re: /(deny-list|denylist)\.json$/, why: 'deny-list' },
  { re: /\.test\.(ts|tsx|mjs|js)$/, why: 'test file' },
];
/** The app's own files; third-party packages and the OS are not ours to scan for words */
const OWN = /^(app\/(dist|drizzle|env\.example)|srv\/|etc\/marksy\/|usr\/local\/bin\/marksy)/;
const SECRETS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b(?:token|password|secret|api[_-]?key)\s*[:=]\s*['"][A-Za-z0-9._~+/=-]{24,}['"]/i,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/,
];
const EMAIL = /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/;
const SECRET_ENV = /(SECRET|PASSWORD|TOKEN|CREDENTIALS|PRIVATE)/;

/** Problems in one file of the image; deny is commit-guard's loadDenyList() or null */
export function checkFile(path, text, deny = null) {
  const problems = [];
  for (const f of FORBIDDEN_PATHS) if (f.re.test(path)) problems.push(`${path}: ${f.why}`);
  if (text === null || !OWN.test(path)) return problems;
  if (SECRETS.some((re) => re.test(text))) problems.push(`${path}: looks like a secret`);
  if (EMAIL.test(text)) problems.push(`${path}: an e-mail address outside example.com`);
  if (deny && denyHits(text, deny).length) problems.push(`${path}: a value from the local deny-list`);
  return problems;
}

/** Image variables that look like secrets; MARKSY_VERSION and the like are fine */
export function checkEnv(env) {
  return env
    .map((e) => e.split('=')[0])
    .filter((k) => SECRET_ENV.test(k))
    .map((k) => `image variable ${k}`);
}

/** Reads a tar stream entry by entry: (path, body or null for a large or binary file) */
async function* tarEntries(stream) {
  let buf = Buffer.alloc(0);
  let need = null;
  let header = null;
  for await (const chunk of stream) {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (!header) {
        if (buf.length < 512) break;
        const h = buf.subarray(0, 512);
        buf = buf.subarray(512);
        if (h.every((b) => b === 0)) continue;
        const name = h.subarray(0, 100).toString('utf8').replace(/\0.*$/s, '');
        const prefix = h.subarray(345, 500).toString('utf8').replace(/\0.*$/s, '');
        const size = parseInt(h.subarray(124, 136).toString('ascii').replace(/\0.*$/s, '').trim() || '0', 8);
        header = { path: prefix ? `${prefix}/${name}` : name, size, type: String.fromCharCode(h[156] || 48) };
        need = Math.ceil(size / 512) * 512;
      }
      if (buf.length < need) break;
      const body = buf.subarray(0, header.size);
      buf = buf.subarray(need);
      const small = header.size < 5_000_000 && (header.type === '0' || header.type === '\0');
      yield { path: header.path.replace(/^\.?\//, ''), body: small ? Buffer.from(body) : null };
      header = null;
      need = null;
    }
  }
}

async function main(image) {
  if (!image) {
    console.error('pnpm image:audit <image>');
    return 2;
  }
  const deny = loadDenyList(fileURLToPath(new URL('..', import.meta.url)));
  const problems = [];
  const inspect = spawnSync('docker', ['image', 'inspect', '--format', '{{json .Config.Env}}', image], {
    encoding: 'utf8',
  });
  if (inspect.status !== 0) {
    console.error(`no such image: ${image}`);
    return 2;
  }
  problems.push(...checkEnv(JSON.parse(inspect.stdout)));
  const id = spawnSync('docker', ['create', image], { encoding: 'utf8' }).stdout.trim();
  let files = 0;
  try {
    const child = spawn('docker', ['export', id], { stdio: ['ignore', 'pipe', 'inherit'] });
    for await (const { path, body } of tarEntries(child.stdout)) {
      files++;
      const text = body && !body.includes(0) ? body.toString('utf8') : null;
      problems.push(...checkFile(path, text, deny));
    }
  } finally {
    spawnSync('docker', ['rm', id]);
  }
  for (const p of problems) console.log(`  ${p}`);
  console.log(
    `image audit ${image}: ${files} files, ${problems.length} problem(s)${deny ? ', local deny-list applied' : ''}`,
  );
  return problems.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main(process.argv[2]);
