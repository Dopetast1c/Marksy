import { parseChannel } from './channel';
import { parseQuietHours } from './quiet';
import type { QuietHours } from './quiet';

// The updater's settings (env.example, "Updates"). Everything has a default but the hook secret and the internal
// token, which init-env generates.

export const DEFAULT_PREFIX = 'ghcr.io/dopetast1c/marksy-';

export interface Settings {
  prefix: string;
  channel: string;
  quiet: QuietHours | null;
  paused: boolean;
  pollMs: number;
  healthTimeoutMs: number;
  collectorWaitMs: number;
  minFreeMb: number;
  hookSecret: string;
  hookPort: number;
  controlPort: number;
  stateDir: string;
  guardUrl: string;
  serverUrl: string;
  serverInternalUrl: string;
  backupUrl: string;
  internalToken: string;
  testKey: string | undefined;
  testForward: string | undefined;
}

const number = (v: string | undefined, fallback: number, min: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

export function readSettings(env: NodeJS.ProcessEnv = process.env): Settings {
  const prefix = env.UPDATE_IMAGE_PREFIX?.trim() || DEFAULT_PREFIX;
  // another registry only for the end-to-end test, on this machine
  if (prefix !== DEFAULT_PREFIX && !/^(localhost|127\.0\.0\.1)(:\d+)?\/[\w./-]+-$/.test(prefix))
    throw new Error('UPDATE_IMAGE_PREFIX may only point at a test registry on localhost');
  const channel = env.UPDATE_CHANNEL?.trim() || '1';
  parseChannel(channel);
  return {
    prefix,
    channel,
    quiet: parseQuietHours(env.UPDATE_QUIET_HOURS),
    paused: env.UPDATE_PAUSED === 'true',
    pollMs: number(env.UPDATE_POLL_MINUTES, 5, 1) * 60_000,
    healthTimeoutMs: number(env.UPDATE_HEALTH_TIMEOUT_SECONDS, 300, 30) * 1000,
    collectorWaitMs: number(env.UPDATE_COLLECTOR_WAIT_MINUTES, 20, 1) * 60_000,
    minFreeMb: number(env.UPDATE_MIN_FREE_MB, 1024, 0),
    hookSecret: env.UPDATE_HOOK_SECRET ?? '',
    hookPort: number(env.UPDATE_HOOK_PORT, 8090, 1),
    controlPort: 8091,
    stateDir: env.UPDATE_STATE_DIR || '/state',
    guardUrl: env.DOCKER_GUARD_URL || 'http://socket-guard:2375',
    serverUrl: env.SERVER_URL || 'http://server:3000',
    serverInternalUrl: env.SERVER_INTERNAL_URL || 'http://server:3001',
    backupUrl: env.BACKUP_INTERNAL_URL || 'http://backup:3002',
    internalToken: env.MARKSY_INTERNAL_TOKEN ?? '',
    testKey: prefix === DEFAULT_PREFIX ? undefined : env.UPDATE_TEST_COSIGN_KEY || undefined,
    // the test registry runs in another container: localhost:<port> inside this one is forwarded to it
    testForward: prefix === DEFAULT_PREFIX ? undefined : env.UPDATE_TEST_REGISTRY_FORWARD || undefined,
  };
}
