import type { ColumnType } from 'kysely';

export interface SystemMetadataTable {
  key: string;
  value: string;
  updated_at: ColumnType<Date, string | undefined, string>;
}

/**
 * Add one property per table as migrations introduce them. Keep this file
 * hand-written; generated API types live under `src/generated`.
 */
export interface DatabaseSchema {
  system_metadata: SystemMetadataTable;
}
