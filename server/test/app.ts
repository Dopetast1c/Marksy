import { demoFullTransport, demoLiteTransport, demoTransport } from '@marksy/registry';
import { createApp } from '../src/app';
import type { AppDeps } from '../src/http/context';
import { testDb } from './db';
import { TEST_CREDENTIALS_KEY } from './factories';

// The API on the test database, with the fictional diaries answering instead of the network.

export function testDeps(over: Partial<AppDeps> = {}): AppDeps {
  return {
    db: testDb(),
    credentialsKey: TEST_CREDENTIALS_KEY,
    secureCookies: false,
    allowDemoProviders: true,
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
