#!/usr/bin/env node
// Creates .env from .env.example and fills the two generated secrets (SESSION_SECRET, CREDENTIALS_KEY) when they are
// empty. Prints only what it did, never a value. Safe to re-run: existing values are kept. Run: pnpm setup:env.
// The diary login (DIARY_*) and the dev Marksy login (MARKSY_DEV_*) are left for the owner to type in.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const target = '.env';
const created = !existsSync(target);
let text = readFileSync(created ? '.env.example' : target, 'utf8');

const generated = {
  SESSION_SECRET: () => randomBytes(48).toString('base64url'),
  CREDENTIALS_KEY: () => randomBytes(32).toString('base64'),
};
const filled = [];
for (const [key, make] of Object.entries(generated)) {
  const re = new RegExp(`^${key}=\\s*$`, 'm');
  if (re.test(text)) {
    text = text.replace(re, `${key}=${make()}`);
    filled.push(key);
  }
}
// The school's time zone defaults to this computer's zone; it can be changed in .env afterwards
if (/^TZ=\s*$/m.test(text)) {
  text = text.replace(/^TZ=\s*$/m, `TZ=${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  filled.push('TZ');
}
writeFileSync(target, text);

console.log(created ? 'created .env from .env.example' : '.env already exists, kept');
console.log(filled.length ? `filled: ${filled.join(', ')}` : 'secrets already set');
const missing = ['DIARY_LOGIN', 'DIARY_PASSWORD', 'MARKSY_DEV_EMAIL', 'MARKSY_DEV_PASSWORD'].filter((k) =>
  new RegExp(`^${k}=\\s*$`, 'm').test(text),
);
if (missing.length) console.log(`for the owner to fill in .env (not needed before M2): ${missing.join(', ')}`);
