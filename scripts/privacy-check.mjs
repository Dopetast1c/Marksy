#!/usr/bin/env node
// Privacy and boundary check for a public repository (CLAUDE.md, "Security"). Run: pnpm privacy.
// Fails on: secrets and tokens, files that must never be committed, real-looking personal data, and the diary
// provider leaking outside providers/by-eschools. Heuristic on purpose: a false positive is cheap, a leak is not.
// To allow a deliberate match, put `privacy-ok` in a comment on the same line and say why.
// --staged checks only the files staged for commit, as staged (the pre-commit guard, scripts/commit-guard.mjs).
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const staged = process.argv.includes('--staged');
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  'data',
  'raw',
  '.vite',
  'Claude outputs',
]);

function listFiles() {
  if (staged) {
    const out = execSync('git diff --cached --name-only -z --diff-filter=ACMR', { cwd: root });
    return out.toString().split('\0').filter(Boolean);
  }
  try {
    const out = execSync('git ls-files --cached --others --exclude-standard', {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.toString().split('\n').filter(Boolean);
  } catch {
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) continue;
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else files.push(relative(root, p).split(sep).join('/'));
      }
    };
    walk(root);
    return files;
  }
}

const FORBIDDEN_FILES = [
  { re: /(^|\/)\.env$|(^|\/)\.env\.(?!example$)[^/]+$/, why: 'environment file with secrets' },
  { re: /\.har$/i, why: 'HAR export (contains tokens and personal data)' },
  { re: /\.(dump|sqlite3?|db|sql\.gz)$/i, why: 'database dump' },
  { re: /^data\//, why: 'local data folder' },
];

const SECRET_PATTERNS = [
  { re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/, why: 'JWT' },
  { re: /Bearer\s+[A-Za-z0-9._~+/-]{24,}/, why: 'bearer token' },
  { re: /\b\d{8,10}:AA[A-Za-z0-9_-]{30,}\b/, why: 'Telegram bot token' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'private key' },
  { re: /\b(?:token|password|secret|api[_-]?key)\s*[:=]\s*['"][A-Za-z0-9._~+/=-]{16,}['"]/i, why: 'hard-coded secret' },
];

const PERSONAL_PATTERNS = [
  {
    re: /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org|net)\b|anthropic\.com\b|users\.noreply\.github\.com\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    why: 'e-mail address (use example.com)',
  },
  { re: /\+375[\s(-]*\d{2}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/, why: 'Belarusian phone number' },
];

// Only these places may know the diary system by name (docs explain it; the provider implements it).
const PROVIDER_WORDS = /e-?schools/i;
const PROVIDER_ALLOWED = [
  /^providers\/by-eschools\//,
  // the registry lists providers by id (docs/providers.md 2): its import line, its test and its package.json, nothing else
  /^packages\/registry\/(src\/index(\.test)?\.ts|package\.json)$/,
  /^docs\//,
  /^README\.md$/,
  /^CLAUDE\.md$/,
  /^\.env\.example$/,
  /^scripts\/privacy-check\.mjs$/,
  /^scripts\/init-env\.mjs$/,
  /^\.claude\//,
];
const CODE = /^(server|web|packages)\/.*\.(ts|tsx|js|mjs)$/;

const TEXT_EXT = /\.(ts|tsx|js|mjs|cjs|json|md|html|css|yml|yaml|sql|txt|example|env)$|(^|\/)[^.]+$/i;
const problems = [];
for (const file of listFiles()) {
  for (const f of FORBIDDEN_FILES) if (f.re.test(file)) problems.push(`${file}: ${f.why} must not be committed`);
  if (!TEXT_EXT.test(file) || file === 'pnpm-lock.yaml') continue;
  let text;
  try {
    text = staged
      ? execSync(`git show ${JSON.stringify(':' + file)}`, { cwd: root, maxBuffer: 256 * 1024 * 1024 }).toString('utf8')
      : readFileSync(join(root, file), 'utf8');
  } catch {
    continue;
  }
  text.split('\n').forEach((line, i) => {
    if (line.includes('privacy-ok')) return;
    const at = `${file}:${i + 1}`;
    for (const p of SECRET_PATTERNS) if (p.re.test(line)) problems.push(`${at}: ${p.why}`);
    for (const p of PERSONAL_PATTERNS) if (p.re.test(line)) problems.push(`${at}: ${p.why}`);
    if (PROVIDER_WORDS.test(line) && !PROVIDER_ALLOWED.some((r) => r.test(file)))
      problems.push(`${at}: diary system named outside providers/by-eschools`);
    if (CODE.test(file) && /console\.(log|info|warn|error)\(.*\b(password|token|secret|cookie)\b/i.test(line))
      problems.push(`${at}: logging a credential`);
  });
}

if (problems.length) {
  console.error(`privacy check: ${problems.length} problem(s)\n` + problems.map((p) => `  ${p}`).join('\n'));
  process.exit(1);
}
console.log('privacy check: ok');
