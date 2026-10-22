-- Runs once, when the volume is created. The test database is separate so `pnpm test` never touches dev data.
CREATE DATABASE marksy_test OWNER marksy;
