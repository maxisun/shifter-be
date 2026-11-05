import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { createKysely } from '../create-kysely.js';
import type { DatabaseSchema } from '../types/database-schema.js';

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not configured');
    this.name = 'DatabaseNotConfiguredError';
  }
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly database: Kysely<DatabaseSchema> | null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.database = config.databaseUrl
      ? createKysely(config.databaseUrl)
      : null;
  }

  /**
   * The typed Kysely handle feature services use. It throws rather than
   * returning a client that would fail later with a confusing connection error.
   */
  get db(): Kysely<DatabaseSchema> {
    if (!this.database) throw new DatabaseNotConfiguredError();
    return this.database;
  }

  async onModuleDestroy(): Promise<void> {
    await this.database?.destroy();
  }
}
