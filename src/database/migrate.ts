import type { Kysely } from 'kysely';
import { Migrator } from 'kysely/migration';
import { loadConfig } from '../config/config.js';
import { createKysely } from './create-kysely.js';
import { StaticMigrationProvider } from './migrations/index.js';
import type { DatabaseSchema } from './types/database-schema.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  if (!config.databaseUrl) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'DATABASE_URL is required to run migrations',
      }),
    );
    process.exitCode = 1;
    return;
  }

  const database: Kysely<DatabaseSchema> = createKysely(config.databaseUrl);
  const migrator = new Migrator({
    db: database,
    provider: new StaticMigrationProvider(),
  });

  try {
    const { error, results } = await migrator.migrateToLatest();
    for (const result of results ?? []) {
      console.log(
        JSON.stringify({
          level: result.status === 'Error' ? 'error' : 'info',
          message: `migration ${result.direction} ${result.migrationName}: ${result.status}`,
        }),
      );
    }
    if (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'Migration failed',
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      process.exitCode = 1;
    } else {
      console.log(
        JSON.stringify({
          level: 'info',
          message: 'Migrations applied',
          applied: (results ?? []).filter(
            (result) => result.status === 'Success',
          ).length,
        }),
      );
    }
  } finally {
    await database.destroy();
  }
}

await main();
