import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * A client-supplied id is accepted only when it is a bounded, log-safe token.
 * Anything else is replaced with a generated UUID so a header cannot inject
 * control characters or unbounded text into logs.
 */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value);
}

export function resolveRequestId(
  header: string | string[] | undefined,
): string {
  const candidate = Array.isArray(header) ? header[0] : header;
  return isValidRequestId(candidate) ? candidate : randomUUID();
}

interface RequestLike {
  id?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * Reads the id pino-http already assigned, falling back to a valid inbound
 * header. Never generates a new id: the filter must report the same id as the
 * response header and access log.
 */
export function requestIdFromRequest(request: RequestLike): string | undefined {
  if (isValidRequestId(request.id)) return request.id;
  const header = request.headers?.[REQUEST_ID_HEADER];
  const candidate = Array.isArray(header) ? header[0] : header;
  return isValidRequestId(candidate) ? candidate : undefined;
}
