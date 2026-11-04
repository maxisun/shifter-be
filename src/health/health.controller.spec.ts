import type { Response } from 'express';
import type { RequestContextService } from '../common/request-context.service.js';
import { HealthController } from './health.controller.js';
import type { HealthService } from './health.service.js';

function controller(readiness: {
  ready: boolean;
  checks: { database: 'up' | 'down' };
}) {
  const health = {
    readiness: vi.fn().mockResolvedValue(readiness),
  } as unknown as HealthService;
  const context = {
    getRequestId: () => 'trace-12345678',
  } as unknown as RequestContextService;
  return new HealthController(health, context);
}

describe('HealthController', () => {
  it('answers liveness with the request id', () => {
    expect(
      controller({ ready: true, checks: { database: 'up' } }).live(),
    ).toEqual({
      status: 'ok',
      requestId: 'trace-12345678',
    });
  });

  it('answers 200 readiness when the database is up', async () => {
    const response = { status: vi.fn() } as unknown as Response;
    const result = await controller({
      ready: true,
      checks: { database: 'up' },
    }).ready(response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(result).toEqual({
      status: 'ok',
      checks: { database: 'up' },
      requestId: 'trace-12345678',
    });
  });

  it('answers 503 readiness when the database is down', async () => {
    const response = { status: vi.fn() } as unknown as Response;
    const result = await controller({
      ready: false,
      checks: { database: 'down' },
    }).ready(response);

    expect(response.status).toHaveBeenCalledWith(503);
    expect(result).toEqual({
      status: 'error',
      checks: { database: 'down' },
      requestId: 'trace-12345678',
    });
  });
});
