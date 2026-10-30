import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GENERATED, initEnv, parseEnv } from './init-env';

// `marksy init-env` (docs/running.md, secrets): a production file from env.example with fresh secrets; a second run
// changes no value that is set; the development key can be carried over; nothing but key names is reported.

const template = readFileSync(new URL('../../../env.example', import.meta.url), 'utf8');

describe('init-env', () => {
  it('a new file: production values, every secret generated, development logins empty', () => {
    const r = initEnv({ template, existing: null, tz: 'Europe/Vienna' });
    const env = parseEnv(r.text);
    for (const key of GENERATED) expect(env.get(key), key).toBeTruthy();
    expect(Buffer.from(env.get('CREDENTIALS_KEY')!, 'base64')).toHaveLength(32);
    expect(env.get('SESSION_SECRET')!.length).toBeGreaterThanOrEqual(32);
    expect(env.get('MARKSY_INTERNAL_TOKEN')!.length).toBeGreaterThanOrEqual(32);
    expect(env.get('NODE_ENV')).toBe('production');
    expect(env.get('HOST')).toBe('0.0.0.0');
    expect(env.get('BASE_PATH')).toBe('/marksy');
    expect(env.get('TZ')).toBe('Europe/Vienna');
    expect(env.get('DATABASE_URL')).toBe(`postgres://marksy:${env.get('POSTGRES_PASSWORD')}@postgres:5432/marksy`);
    for (const key of ['DIARY_LOGIN', 'DIARY_PASSWORD', 'MARKSY_DEV_EMAIL', 'MARKSY_DEV_PASSWORD', 'PRODUCTION_ACTIVE'])
      expect(env.get(key), key).toBe('');
    // every key of the template is in the file, but the image's version (an empty line would hide it), what the compose
    // file sets for the updater, and the tests'
    expect([...parseEnv(template).keys()].filter((k) => !env.has(k))).toEqual([
      'TEST_DATABASE_URL',
      'MARKSY_VERSION',
      'MARKSY_COMMIT',
      'UPDATE_STATE_DIR',
      'UPDATE_HOOK_PORT',
      'DOCKER_GUARD_URL',
      'SERVER_URL',
      'GUARD_PORT',
      'UPDATE_IMAGE_PREFIX',
      'UPDATE_TEST_COSIGN_KEY',
      'MARKSY_UPDATE_EXPECTED',
      'MARKSY_PROBE_DRY_RUN',
    ]);
  });

  it('UTC unless a zone is given; channel 1 unless another is given', () => {
    const plain = parseEnv(initEnv({ template, existing: null }).text);
    expect(plain.get('TZ')).toBe('UTC');
    expect(plain.get('UPDATE_CHANNEL')).toBe('1');
    expect(parseEnv(initEnv({ template, existing: null, channel: 'preview' }).text).get('UPDATE_CHANNEL')).toBe(
      'preview',
    );
  });

  it('a second run changes no value: secrets stay, a missing key is appended, an empty secret is filled', () => {
    const first = initEnv({ template, existing: null });
    const edited = first.text
      .replace(/^BASE_PATH=.*$/m, 'BASE_PATH=/')
      .replace(/^VAPID_PRIVATE_KEY=.*$/m, 'VAPID_PRIVATE_KEY=')
      .replace(/^BACKUP_TIME=.*\n/m, '');
    const second = initEnv({ template, existing: edited });
    const a = parseEnv(first.text);
    const b = parseEnv(second.text);
    for (const key of ['SESSION_SECRET', 'CREDENTIALS_KEY', 'POSTGRES_PASSWORD', 'UPDATE_HOOK_SECRET'])
      expect(b.get(key)).toBe(a.get(key));
    expect(b.get('BASE_PATH')).toBe('/');
    expect(b.get('VAPID_PRIVATE_KEY')).toBeTruthy();
    expect(second.added).toEqual(['BACKUP_TIME']);
    expect(second.generated).toEqual(['VAPID_PRIVATE_KEY']);
  });

  it('carries CREDENTIALS_KEY over from the development file, and only that', () => {
    const dev =
      'CREDENTIALS_KEY=ZGV2LWtleS1kZXYta2V5LWRldi1rZXktZGV2LWtleSE=\nSESSION_SECRET=dev-secret-dev-secret-dev-secret-dev\nDIARY_PASSWORD=pw\n';
    const r = initEnv({ template, existing: null, credentialsFrom: dev });
    const env = parseEnv(r.text);
    expect(env.get('CREDENTIALS_KEY')).toBe('ZGV2LWtleS1kZXYta2V5LWRldi1rZXktZGV2LWtleSE=');
    expect(env.get('SESSION_SECRET')).not.toBe('dev-secret-dev-secret-dev-secret-dev');
    expect(env.get('DIARY_PASSWORD')).toBe('');
    expect(r.copied).toEqual(['CREDENTIALS_KEY']);
  });
});
