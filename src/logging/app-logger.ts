import { Inject, Injectable, type LoggerService } from '@nestjs/common';
import type { Logger as PinoLogger } from 'pino';
import { RequestContextService } from '../common/request-context.service.js';
import { PINO_LOGGER } from './pino-logger.js';

type PinoLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Bridges Nest's LoggerService onto pino so framework logs share the same
 * structured shape, redaction and request id as application logs.
 */
@Injectable()
export class AppLogger implements LoggerService {
  constructor(
    @Inject(PINO_LOGGER) private readonly logger: PinoLogger,
    private readonly context: RequestContextService,
  ) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('info', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('trace', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(
    level: PinoLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    const requestId = this.context.getRequestId();
    const contextName =
      typeof optionalParams.at(-1) === 'string'
        ? (optionalParams.at(-1) as string)
        : undefined;
    const fields = {
      ...(requestId ? { requestId } : {}),
      ...(contextName ? { context: contextName } : {}),
    };

    if (message instanceof Error) {
      this.logger[level]({ ...fields, err: message }, message.message);
      return;
    }
    if (typeof message === 'string') {
      this.logger[level](fields, message);
      return;
    }
    this.logger[level]({ ...fields, detail: message });
  }
}
