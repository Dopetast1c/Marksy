import { defineConfig } from 'vitest/config';

// Server tests share one test database, so files run one after another.
export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
