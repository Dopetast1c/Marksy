import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import * as schema from './schema';

// One pool per process. DATABASE_URL points at the local Docker database (docker-compose.yml); tests use
// TEST_DATABASE_URL (server/test/global-setup.ts) so they never touch the owner's data.

export type Db = NodePgDatabase<typeof schema> & { $client: pg.Pool };

export const DEFAULT_DATABASE_URL = 'postgres://marksy:marksy@localhost:5432/marksy';
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function createDb(url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): Db {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return drizzle(pool, { schema });
}

export async function migrateDb(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
