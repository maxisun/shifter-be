import type { DatabaseService } from '../database/database.service.js';
import { HealthService } from './health.service.js';

function database(ping: boolean): DatabaseService {
  return {
    ping: vi.fn().mockResolvedValue(ping),
  } as unknown as DatabaseService;
}

describe('HealthService', () => {
  it('reports readiness when PostgreSQL answers', async () => {
    const service = new HealthService(database(true));
    await expect(service.readiness()).resolves.toEqual({
      ready: true,
      checks: { database: 'up' },
    });
  });

  it('reports not ready when PostgreSQL does not answer', async () => {
    const service = new HealthService(database(false));
    await expect(service.readiness()).resolves.toEqual({
      ready: false,
      checks: { database: 'down' },
    });
  });
});
