import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import { APP_CONFIG, type AppConfig } from '../../config/config.js';
import { createKysely } from '../create-kysely.js';
import type { DatabaseSchema } from '../types/database-schema.js';

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not configured');
    this.name = 'DatabaseNotConfiguredError';
  }
}

const READINESS_TIMEOUT_MS = 2_000;

function withTimeout<T>(
  operation: Promise<T>,
  milliseconds: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error('Database readiness check timed out')),
      milliseconds,
    );
  });
  return Promise.race([operation, timeout]).finally(() => clearTimeout(timer));
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

  /**
   * Readiness is a real round trip, not a cached flag. It returns false for a
   * missing configuration, a refused connection, or a query that stalls, so a
   * 503 can be trusted to mean "not serving".
   */
  async ping(): Promise<boolean> {
    if (!this.database) return false;
    try {
      await withTimeout(
        sql`select 1`.execute(this.database),
        READINESS_TIMEOUT_MS,
      );
      return true;
    } catch {
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.database?.destroy();
  }
}
