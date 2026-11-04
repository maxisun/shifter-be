import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { DatabaseSchema } from './database-schema.js';

/**
 * One Kysely factory for the server and the migration CLI so both always
 * connect with the same pool limits and connection timeout.
 */
export function createKysely(databaseUrl: string): Kysely<DatabaseSchema> {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 3_000,
    idleTimeoutMillis: 30_000,
  });

  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({ pool }),
  });
}
