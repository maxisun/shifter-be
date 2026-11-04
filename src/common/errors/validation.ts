import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { ERROR_CODES, type ValidationIssue } from './api-error.js';

function flatten(
  errors: ValidationError[],
  parentPath = '',
): ValidationIssue[] {
  return errors.flatMap((error) => {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;
    const own = Object.entries(error.constraints ?? {}).map(
      ([code, message]) => ({ path, code, message }),
    );
    return [...own, ...flatten(error.children ?? [], path)];
  });
}

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    code: ERROR_CODES.validation,
    message: 'Validation failed',
    issues: flatten(errors),
  });
}
