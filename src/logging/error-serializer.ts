import pino from 'pino';
import { redactLogText } from './log-sanitizer.js';

/**
 * Error messages and stacks can contain a connection string, a signed URL, or
 * a token. Redact them before pino serializes the error.
 */
export function redactedErrorSerializer(error: Error): Record<string, unknown> {
  const serialized = pino.stdSerializers.err(error);
  return {
    ...serialized,
    message: redactLogText(serialized.message),
    ...(serialized.stack ? { stack: redactLogText(serialized.stack) } : {}),
  };
}
