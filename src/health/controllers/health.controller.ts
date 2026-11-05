import { Controller, Get } from '@nestjs/common';
import { RequestContextService } from '../../common/request-context.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly requestContext: RequestContextService) {}

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
}
