import type { IncomingMessage } from 'node:http';
import pino from 'pino';
import type { Options } from 'pino-http';
import { pathOnly } from '../common/path.js';
import { REQUEST_ID_HEADER, resolveRequestId } from '../common/request-id.js';
import { redactedErrorSerializer } from './error-serializer.js';

/**
 * HTTP access logging with a request id on every exchange. Request and
 * response headers are deliberately omitted: cookies and authorization
 * headers are secrets, and pino-http must not serialize a query string that
 * can carry a verification or reset token.
 */
export function httpLoggerOptions(
  logger: pino.Logger,
): Options<IncomingMessage, import('node:http').ServerResponse> {
  return {
    logger,
    genReqId(request, response) {
      const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
      response.setHeader(REQUEST_ID_HEADER, requestId);
      return requestId;
    },
    serializers: {
      req(request) {
        return {
          id: request.id,
          method: request.method,
          path: pathOnly(request.url),
        };
      },
      res(response) {
        return { statusCode: response.statusCode };
      },
      err: redactedErrorSerializer,
    },
    customProps(request) {
      return { requestId: request.id };
    },
    customLogLevel(_request, response, error) {
      if (error || response.statusCode >= 500) return 'error';
      if (response.statusCode >= 400) return 'warn';
      return 'info';
    },
    autoLogging: {
      ignore: (request) => pathOnly(request.url) === '/health/live',
    },
  };
}
