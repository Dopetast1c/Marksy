#!/usr/bin/env node
// `pnpm env:dev`: puts the development mode of the manual real runs into .env (server/src/cli/mode.ts, D57):
// MARKSY_ENV=development and DEV_MIN_LOGIN_INTERVAL_MINUTES=10. A key that has a value is kept as it is; a missing key is
// appended, an empty one (`KEY=`) filled in place. Prints only "added" or "already set" per key, never a value.
// `pnpm env:dev --production-active`, once production runs on the same diary accounts, also sets
// PRODUCTION_ACTIVE=true (the one value it changes when set, because the owner asked for it by name): development runs
// then keep the production limits (docs/running.md).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const DEV_KEYS = { MARKSY_ENV: 'development', DEV_MIN_LOGIN_INTERVAL_MINUTES: '10' };

/** The text with every missing or empty key set, and per key whether it was added */
export function ensureKeys(text, entries) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const results = {};
  let out = text;
  for (const [key, value] of Object.entries(entries)) {
    const line = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=(.*)$`, 'm');
    const found = out.match(line);
    if (found && found[1].replace(/#.*$/, '').trim() !== '') {
      results[key] = 'already set';
      continue;
    }
    if (found) out = out.replace(line, `${key}=${value}`);
    else out = `${out}${out === '' || out.endsWith('\n') ? '' : eol}${key}=${value}${eol}`;
    results[key] = 'added';
  }
  return { text: out, results };
}

/** The text with one key set to this value, whatever it held: "set" or "already set" */
export function setKey(text, key, value) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const line = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=(.*)$`, 'm');
  const found = text.match(line);
  if (found && found[1].replace(/#.*$/, '').trim() === value) return { text, result: 'already set' };
  if (found) return { text: text.replace(line, `${key}=${value}`), result: 'set' };
  return { text: `${text}${text === '' || text.endsWith('\n') ? '' : eol}${key}=${value}${eol}`, result: 'set' };
}

function main(args) {
  const target = '.env';
  if (!existsSync(target)) {
    console.error('no .env here: run pnpm setup:env first');
    return 2;
  }
  let { text, results } = ensureKeys(readFileSync(target, 'utf8'), DEV_KEYS);
  let changed = Object.values(results).includes('added');
  if (args.includes('--production-active')) {
    const active = setKey(text, 'PRODUCTION_ACTIVE', 'true');
    text = active.text;
    results = { ...results, PRODUCTION_ACTIVE: active.result };
    changed ||= active.result === 'set';
  }
  if (changed) writeFileSync(target, text);
  for (const [key, result] of Object.entries(results)) console.log(`${key}: ${result}`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = main(process.argv.slice(2));
