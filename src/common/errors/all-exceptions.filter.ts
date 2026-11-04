import { randomUUID } from 'node:crypto';
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Logger } from 'pino';
import { PINO_LOGGER } from '../../logging/pino-logger.js';
import { pathOnly } from '../path.js';
import { RequestContextService } from '../request-context.service.js';
import { REQUEST_ID_HEADER, requestIdFromRequest } from '../request-id.js';
import { buildErrorBody } from './api-error.js';

/**
 * Every failure leaves the service through this filter, so the contract's
 * Error envelope is the only error shape a client can observe.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    @Inject(PINO_LOGGER) private readonly logger: Logger,
    private readonly requestContext: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const requestId =
      requestIdFromRequest(request) ??
      this.requestContext.getRequestId() ??
      randomUUID();
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const { status, body } = buildErrorBody(exception, requestId);

    const logFields = {
      requestId,
      status,
      code: body.code,
      method: request.method,
      path: pathOnly(request.originalUrl ?? request.url),
    };
    if (status >= 500) {
      this.logger.error(
        { ...logFields, err: exception },
        'Unhandled request error',
      );
    } else {
      this.logger.warn(logFields, 'Request rejected');
    }

    response.status(status).json(body);
  }
}
