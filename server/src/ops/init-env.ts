import { createECDH, randomBytes } from 'node:crypto';

// `marksy init-env <file>` (docs/running.md, secrets): the production settings file from env.example, on a host with
// only Docker. It fills what production needs, generates every secret that is empty, and never changes a value that
// is set: a second run adds only keys a newer version brought. It reports key names, never a value, except the update
// hook's secret when asked once, to copy it into the repository's secrets.

export const GENERATED = [
  'SESSION_SECRET',
  'CREDENTIALS_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'UPDATE_HOOK_SECRET',
  'MARKSY_INTERNAL_TOKEN',
  'POSTGRES_PASSWORD',
] as const;

/** What a production file says where env.example has a development value; empty values are left for the owner */
const PRODUCTION: Record<string, string> = {
  NODE_ENV: 'production',
  MARKSY_ENV: 'production',
  HOST: '0.0.0.0',
  PORT: '3000',
  BASE_PATH: '/marksy',
  SIGNUP: 'first',
  API_DOCS: 'session',
  UPLOADS_DIR: '/data/uploads',
  PUBLIC_URL: '',
  TZ: 'UTC',
  DB_POOL_MAX: '5',
  // development only: never in a production file
  DIARY_LOGIN: '',
  DIARY_PASSWORD: '',
  DEV_MIN_LOGIN_INTERVAL_MINUTES: '',
  MARKSY_DEV_EMAIL: '',
  MARKSY_DEV_PASSWORD: '',
  MARKSY_RUNNER: '',
  PRODUCTION_ACTIVE: '',
};

/**
 * Keys a production file never has: the image sets its version and commit (an empty line here would hide them), and
 * the test switches mean nothing there
 */
const LEFT_OUT = new Set([
  'MARKSY_VERSION',
  'MARKSY_COMMIT',
  'TEST_DATABASE_URL',
  'MARKSY_UPDATE_EXPECTED',
  'MARKSY_PROBE_DRY_RUN',
  // set by docker-compose.prod.yml, or only for the updater's end-to-end test
  'UPDATE_STATE_DIR',
  'UPDATE_HOOK_PORT',
  'DOCKER_GUARD_URL',
  'SERVER_URL',
  'GUARD_PORT',
  'UPDATE_IMAGE_PREFIX',
  'UPDATE_TEST_COSIGN_KEY',
  'UPDATE_TEST_REGISTRY_FORWARD',
]);

function vapidKeys() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  return { pub: ecdh.getPublicKey().toString('base64url'), priv: ecdh.getPrivateKey().toString('base64url') };
}

function generate(): Record<(typeof GENERATED)[number], string> {
  const vapid = vapidKeys();
  return {
    SESSION_SECRET: randomBytes(48).toString('base64url'),
    CREDENTIALS_KEY: randomBytes(32).toString('base64'),
    VAPID_PUBLIC_KEY: vapid.pub,
    VAPID_PRIVATE_KEY: vapid.priv,
    UPDATE_HOOK_SECRET: randomBytes(32).toString('hex'),
    MARKSY_INTERNAL_TOKEN: randomBytes(32).toString('hex'),
    POSTGRES_PASSWORD: randomBytes(24).toString('base64url'),
  };
}

const LINE = /^[ \t]*(?:export[ \t]+)?([A-Z][A-Z0-9_]*)[ \t]*=(.*)$/;

/** KEY=value pairs of an env file (comments and blank lines skipped, a trailing comment kept out) */
export function parseEnv(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(LINE);
    if (m) out.set(m[1]!, m[2]!.replace(/\s+#.*$/, '').trim());
  }
  return out;
}

export interface InitEnvOptions {
  /** env.example's text */
  template: string;
  /** the existing file's text, or null when there is none */
  existing: string | null;
  /** another env file (the development .env) to take CREDENTIALS_KEY from, so its stored diary passwords stay readable */
  credentialsFrom?: string | null;
  tz?: string;
  /** UPDATE_CHANNEL of a new file instead of env.example's 1 */
  channel?: string;
}

export interface InitEnvResult {
  text: string;
  added: string[];
  generated: string[];
  kept: string[];
  copied: string[];
}

export function initEnv(opts: InitEnvOptions): InitEnvResult {
  const existing = opts.existing === null ? null : parseEnv(opts.existing);
  const fresh = generate();
  const fromOther = opts.credentialsFrom ? parseEnv(opts.credentialsFrom).get('CREDENTIALS_KEY') || '' : '';
  const result: InitEnvResult = { text: '', added: [], generated: [], kept: [], copied: [] };

  /** the value for a key the file does not have yet */
  const valueFor = (key: string, templateValue: string): string => {
    if (key === 'CREDENTIALS_KEY' && fromOther) {
      result.copied.push(key);
      return fromOther;
    }
    if ((GENERATED as readonly string[]).includes(key)) {
      result.generated.push(key);
      return fresh[key as (typeof GENERATED)[number]];
    }
    if (key === 'TZ' && opts.tz) return opts.tz;
    if (key === 'UPDATE_CHANNEL' && opts.channel) return opts.channel;
    return key in PRODUCTION ? PRODUCTION[key]! : templateValue;
  };

  if (!existing) {
    // a new file: the template's lines and comments, with production values and fresh secrets
    const password = fresh.POSTGRES_PASSWORD;
    const lines = opts.template.split(/\r?\n/).map((line) => {
      const m = line.match(LINE);
      if (!m) return line;
      const key = m[1]!;
      if (LEFT_OUT.has(key)) return `# ${key}: not in a production file`;
      result.added.push(key);
      if (key === 'DATABASE_URL') return `DATABASE_URL=postgres://marksy:${password}@postgres:5432/marksy`;
      return `${key}=${valueFor(key, m[2]!.trim())}`;
    });
    // what production needs that the template only mentions in a comment (NODE_ENV)
    const extra = Object.entries(PRODUCTION).filter(([key, value]) => value && !result.added.includes(key));
    for (const [key] of extra) result.added.push(key);
    const tail = extra.length ? `\n# production\n${extra.map(([k, v]) => `${k}=${v}`).join('\n')}` : '';
    result.text = `${lines.join('\n').replace(/\n+$/, '')}${tail}\n`;
    return result;
  }

  // an existing file: every set value stays; an empty generated secret is filled; keys it lacks are appended
  const eol = opts.existing!.includes('\r\n') ? '\r\n' : '\n';
  let text = opts.existing!;
  for (const key of GENERATED) {
    if (existing.get(key)) {
      result.kept.push(key);
      continue;
    }
    if (!existing.has(key)) continue;
    const line = new RegExp(`^([ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=).*$`, 'm');
    text = text.replace(line, `$1${valueFor(key, '')}`);
  }
  const missing: string[] = [];
  for (const line of opts.template.split(/\r?\n/)) {
    const m = line.match(LINE);
    if (m && !existing.has(m[1]!) && !LEFT_OUT.has(m[1]!)) {
      const key = m[1]!;
      result.added.push(key);
      missing.push(key === 'DATABASE_URL' ? 'DATABASE_URL=' : `${key}=${valueFor(key, m[2]!.trim())}`);
    }
  }
  if (missing.length)
    text = `${text}${text.endsWith('\n') ? '' : eol}# added by marksy init-env${eol}${missing.join(eol)}${eol}`;
  result.text = text;
  return result;
}
