import { defineConfig } from 'vitest/config';

// Server tests share one test database (marksy_test on the in-memory server, docker-compose.yml), so files run one
// after another in a single worker process: one pool of connections at a time, never two files emptying the tables
// under each other.
export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
