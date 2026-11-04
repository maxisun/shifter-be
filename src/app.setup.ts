import {
  type ArgumentsHost,
  type INestApplication,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { validationExceptionFactory } from './common/errors/validation.js';
import { RequestContextService } from './common/request-context.service.js';
import {
  REQUEST_ID_HEADER,
  requestIdFromRequest,
  resolveRequestId,
} from './common/request-id.js';
import { APP_CONFIG, type AppConfig } from './config/config.js';
import { AppLogger } from './logging/app-logger.js';
import { httpLoggerOptions } from './logging/http-logging.js';
import { PINO_LOGGER } from './logging/pino-logger.js';

/**
 * Shared by `main.ts` and the e2e suite so tests exercise exactly the
 * middleware, validation and error handling that ships.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get<AppConfig>(APP_CONFIG);
  const logger = app.get<Logger>(PINO_LOGGER);
  const requestContext = app.get(RequestContextService);

  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', config.trustProxy ? 1 : false);

  // Order matters: pino-http assigns the request id, then the async-local
  // context makes that id available to services and the error filter.
  app.use(pinoHttp(httpLoggerOptions(logger)));
  app.use((request: Request, response: Response, next: NextFunction) => {
    const requestId =
      requestIdFromRequest(request) ??
      resolveRequestId(request.headers[REQUEST_ID_HEADER]);
    response.setHeader(REQUEST_ID_HEADER, requestId);
    requestContext.run({ requestId }, next);
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(app.get(AllExceptionsFilter));
  app.useLogger(app.get(AppLogger));
  app.flushLogs();

  // Contract operations live under the pinned `servers` URL. Operational
  // routes stay at the origin so probes remain prefix-free.
  app.setGlobalPrefix('api/v1', {
    exclude: ['/', 'health/live', 'health/ready'],
  });
}

/**
 * Must run after `app.init()`: it appends the last middleware to Express's
 * stack, so it only sees requests no Nest route matched. Reusing the global
 * filter keeps the envelope, request id, and logging identical to route
 * failures.
 */
export function installNotFoundHandler(app: INestApplication): void {
  const filter = app.get(AllExceptionsFilter);
  const express = app.getHttpAdapter().getInstance();
  express.use((request: Request, response: Response) => {
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ArgumentsHost;
    filter.catch(
      new NotFoundException(`Cannot ${request.method} ${request.path}`),
      host,
    );
  });
}
