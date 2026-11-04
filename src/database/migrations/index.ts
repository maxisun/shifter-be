import type { Migration, MigrationProvider } from 'kysely/migration';
import * as systemMetadata from './0001-system-metadata.js';

export const migrations: Record<string, Migration> = {
  '0001_system_metadata': systemMetadata,
};

/**
 * Migrations are compiled with the application; no runtime filesystem scan is
 * needed and a missing build cannot silently skip one.
 */
export class StaticMigrationProvider implements MigrationProvider {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  }
}
