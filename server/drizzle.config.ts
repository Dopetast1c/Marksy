import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @marksy/server db:generate` writes a migration into drizzle/ from the schema; `pnpm db:migrate`
// applies them. `pnpm db:studio` opens Drizzle Studio on DATABASE_URL.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://marksy:marksy@localhost:5432/marksy' },
  strict: true,
});
