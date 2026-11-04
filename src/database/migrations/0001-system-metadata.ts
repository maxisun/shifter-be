import { type Kysely, sql } from 'kysely';

/**
 * A minimal operational table so a clean database has a real schema to apply
 * and future migrations have a neighbour. Domain tables arrive with their
 * feature tickets.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable('system_metadata')
    .addColumn('key', 'text', (column) => column.primaryKey())
    .addColumn('value', 'text', (column) => column.notNull())
    .addColumn('updated_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable('system_metadata').execute();
}
