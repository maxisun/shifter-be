import { HttpException, HttpStatus } from '@nestjs/common';
import type { components } from '../../generated/api/schema.js';

export type ApiErrorBody = components['schemas']['Error'];
export type ValidationIssue = components['schemas']['ValidationIssue'];

/**
 * Stable codes named by the contract. Workflow-specific codes are added by the
 * feature that owns the transition; these cover the cross-cutting failures
 * every request can produce.
 */
export const ERROR_CODES = {
  validation: 'VALIDATION_ERROR',
  authenticationRequired: 'AUTHENTICATION_REQUIRED',
  accessDenied: 'ACCESS_DENIED',
  notFound: 'RESOURCE_NOT_FOUND',
  conflict: 'CONFLICT',
  internal: 'INTERNAL_ERROR',
} as const;

export interface BuiltError {
  status: number;
  body: ApiErrorBody;
}

interface StatusDescriptor {
  code: string;
  message: string;
  /** Nest's default phrase, replaced by the friendlier message. */
  phrase?: string;
}

const STATUS_DESCRIPTORS: Record<number, StatusDescriptor> = {
  [HttpStatus.BAD_REQUEST]: {
    code: ERROR_CODES.validation,
    message: 'Validation failed',
    phrase: 'Bad Request',
  },
  [HttpStatus.UNAUTHORIZED]: {
    code: ERROR_CODES.authenticationRequired,
    message: 'Authentication required',
    phrase: 'Unauthorized',
  },
  [HttpStatus.FORBIDDEN]: {
    code: ERROR_CODES.accessDenied,
    message: 'Access denied',
    phrase: 'Forbidden',
  },
  [HttpStatus.NOT_FOUND]: {
    code: ERROR_CODES.notFound,
    message: 'Resource not found',
    phrase: 'Not Found',
  },
  [HttpStatus.CONFLICT]: {
    code: ERROR_CODES.conflict,
    message: 'Conflict',
    phrase: 'Conflict',
  },
  [HttpStatus.UNPROCESSABLE_ENTITY]: {
    code: ERROR_CODES.validation,
    message: 'Validation failed',
    phrase: 'Unprocessable Entity',
  },
};

function descriptorFor(status: number): StatusDescriptor {
  return (
    STATUS_DESCRIPTORS[status] ??
    (status >= 500
      ? { code: ERROR_CODES.internal, message: 'Internal server error' }
      : { code: 'REQUEST_FAILED', message: 'Request failed' })
  );
}

function statusFor(exception: unknown): number {
  return exception instanceof HttpException
    ? exception.getStatus()
    : HttpStatus.INTERNAL_SERVER_ERROR;
}

function normalizeMessage(status: number, message: string): string {
  const descriptor = descriptorFor(status);
  return descriptor.phrase && message === descriptor.phrase
    ? descriptor.message
    : message;
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.path === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string'
  );
}

/**
 * Converts any thrown value into the contract's Error schema. Internal
 * failures are deliberately opaque: the stack belongs in the log, not the
 * response. A feature-specific code or issues array on the exception wins.
 */
export function buildErrorBody(
  exception: unknown,
  requestId: string,
): BuiltError {
  const status = statusFor(exception);
  const descriptor = descriptorFor(status);
  let code = descriptor.code;
  let message = descriptor.message;
  let issues: ValidationIssue[] = [];

  if (exception instanceof HttpException && status < 500) {
    const response = exception.getResponse();
    if (typeof response === 'string') {
      message = response;
    } else if (typeof response === 'object' && response !== null) {
      const detail = response as Record<string, unknown>;
      if (typeof detail.code === 'string' && detail.code.length > 0) {
        code = detail.code;
      }
      if (typeof detail.message === 'string' && detail.message.length > 0) {
        message = normalizeMessage(status, detail.message);
      }
      if (Array.isArray(detail.issues)) {
        issues = detail.issues.filter(isValidationIssue);
      }
    }
  }

  return {
    status,
    body: {
      code,
      message,
      issues,
      requestId,
    },
  };
}
