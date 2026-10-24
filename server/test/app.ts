import { randomBytes } from 'node:crypto';
import { demoFullTransport, demoLiteTransport, demoTransport } from '@marksy/registry';
import { createApp } from '../src/app';
import type { AppDeps } from '../src/http/context';
import { readSyncConfig } from '../src/sync/config';
import { testDb } from './db';
import { TEST_CREDENTIALS_KEY } from './factories';

// The API on the test database, with the fictional diaries answering instead of the network. Work the API leaves
// running after an answer (the first sync after connecting) is collected, and every test file waits for it after each
// test (settle), so nothing writes to the database while the next test empties it.

const inFlight: Promise<unknown>[] = [];
/** A random key per test run, like the credentials key */
const TEST_SESSION_SECRET = randomBytes(32).toString('hex');

export const settle = () => Promise.allSettled(inFlight.splice(0));

export function testDeps(over: Partial<AppDeps> = {}): AppDeps {
  return {
    db: testDb(),
    credentialsKey: TEST_CREDENTIALS_KEY,
    secret: TEST_SESSION_SECRET,
    secureCookies: false,
    allowDemoProviders: true,
    syncConfig: readSyncConfig({}),
    sleep: async () => undefined,
    background: (work) => void inFlight.push(work),
    transportFor: (providerId) =>
      providerId === 'demo-full'
        ? demoFullTransport()
        : providerId === 'demo-lite'
          ? demoLiteTransport()
          : providerId === 'demo-minimal'
            ? demoTransport()
            : undefined,
    ...over,
  };
}

export const testApp = (over: Partial<AppDeps> = {}) => createApp(testDeps(over));
