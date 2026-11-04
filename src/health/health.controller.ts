import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequestContextService } from '../common/request-context.service.js';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly requestContext: RequestContextService,
  ) {}

  /**
   * Liveness only answers "is this process accepting requests?". It must not
   * depend on the database, so a dependency outage does not get the process
   * restarted.
   */
  @Get('live')
  live(): { status: 'ok'; requestId: string | undefined } {
    return {
      status: 'ok',
      requestId: this.requestContext.getRequestId(),
    };
  }

  /**
   * Readiness performs a real database round trip. A 503 here is the signal a
   * load balancer or orchestrator should use to stop sending traffic.
   */
  @Get('ready')
  async ready(@Res({ passthrough: true }) response: Response): Promise<{
    status: 'ok' | 'error';
    checks: { database: 'up' | 'down' };
    requestId: string | undefined;
  }> {
    const readiness = await this.health.readiness();
    response.status(readiness.ready ? 200 : 503);
    return {
      status: readiness.ready ? 'ok' : 'error',
      checks: readiness.checks,
      requestId: this.requestContext.getRequestId(),
    };
  }
}
