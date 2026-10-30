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
/** server/drizzle; the image keeps them at MARKSY_MIGRATIONS_DIR, next to its bundle */
export const MIGRATIONS_DIR =
  process.env.MARKSY_MIGRATIONS_DIR?.trim() || fileURLToPath(new URL('../../drizzle', import.meta.url));

export function createDb(url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL): Db {
  // DB_POOL_MAX (env.example): fewer connections on a small host
  const max = Math.max(2, Number(process.env.DB_POOL_MAX?.trim() || 10) || 10);
  const pool = new pg.Pool({ connectionString: url, max });
  return drizzle(pool, { schema });
}

/** Any number that no other advisory lock of Marksy uses (login-guard.ts takes 7_341_001) */
export const MIGRATION_LOCK = 7_341_010;

/**
 * Applies the migrations that are not applied yet (CLAUDE.md, migrations): under an advisory lock, so of two processes
 * starting at once only one migrates and the other finds nothing left to do; and in one transaction (drizzle's migrator
 * runs every pending file in one), so a failure leaves the schema exactly as it was. Returns how many were applied.
 */
export async function migrateDb(db: Db, folder = MIGRATIONS_DIR): Promise<number> {
  const client = await db.$client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK]);
    const applied = async () => {
      const { rows } = await client.query<{ n: string }>(
        "select count(*) as n from information_schema.tables where table_schema = 'drizzle' and table_name = '__drizzle_migrations'",
      );
      if (rows[0]?.n === '0') return 0;
      return Number(
        (await client.query<{ n: string }>('select count(*) as n from drizzle.__drizzle_migrations')).rows[0]?.n,
      );
    };
    const before = await applied();
    await migrate(drizzle(client, { schema }), { migrationsFolder: folder });
    return (await applied()) - before;
  } finally {
    await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => undefined);
    client.release();
  }
}
