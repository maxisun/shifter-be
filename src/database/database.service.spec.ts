import { loadConfig } from '../config/config.js';
import {
  DatabaseNotConfiguredError,
  DatabaseService,
} from './database.service.js';

describe('DatabaseService', () => {
  it('stays unconfigured without DATABASE_URL', async () => {
    const service = new DatabaseService(loadConfig({}));

    expect(() => service.db).toThrow(DatabaseNotConfiguredError);
    await expect(service.ping()).resolves.toBe(false);
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('reports not ready when PostgreSQL refuses the connection', async () => {
    const service = new DatabaseService(
      loadConfig({
        DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:1/none',
      }),
    );

    expect(service.db).toBeDefined();
    await expect(service.ping()).resolves.toBe(false);
    await service.onModuleDestroy();
  });
});
