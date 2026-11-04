import pino, {
  type DestinationStream,
  type LoggerOptions,
  type Logger as PinoLogger,
} from 'pino';
import type { AppConfig } from '../config/config.js';
import { redactedErrorSerializer } from './error-serializer.js';
import { redactLogText, SENSITIVE_LOG_PATHS } from './log-sanitizer.js';

export const PINO_LOGGER = Symbol('PINO_LOGGER');

export function pinoOptions(config: AppConfig): LoggerOptions {
  return {
    level: config.logLevel,
    base: {
      service: 'shifters-be',
      environment: config.nodeEnv,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    redact: {
      paths: [...SENSITIVE_LOG_PATHS],
      censor: '[REDACTED]',
    },
    serializers: {
      err: redactedErrorSerializer,
    },
    hooks: {
      logMethod(inputArgs, method) {
        const sanitized = inputArgs.map((argument) =>
          typeof argument === 'string' ? redactLogText(argument) : argument,
        );
        return method.apply(this, sanitized as Parameters<typeof method>);
      },
    },
  };
}

export function createPinoLogger(
  config: AppConfig,
  destination?: DestinationStream,
): PinoLogger {
  return destination
    ? pino(pinoOptions(config), destination)
    : pino(pinoOptions(config));
}
