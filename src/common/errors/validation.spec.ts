import { ValidationError } from 'class-validator';
import { validationExceptionFactory } from './validation.js';

function validationError(
  property: string,
  constraints: Record<string, string> = {},
  children: ValidationError[] = [],
): ValidationError {
  return Object.assign(new ValidationError(), {
    property,
    constraints,
    children,
  });
}

describe('validationExceptionFactory', () => {
  it('keeps the contract code and flattens nested errors', () => {
    const exception = validationExceptionFactory([
      validationError('email', { isEmail: 'email must be an email' }),
      validationError('address', {}, [
        validationError('timeZone', { isString: 'timeZone must be a string' }),
      ]),
    ]);

    expect(exception.getStatus()).toBe(400);
    expect(exception.getResponse()).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      issues: [
        {
          path: 'email',
          code: 'isEmail',
          message: 'email must be an email',
        },
        {
          path: 'address.timeZone',
          code: 'isString',
          message: 'timeZone must be a string',
        },
      ],
    });
  });

  it('returns no issues when the errors carry no constraints', () => {
    const exception = validationExceptionFactory([validationError('name')]);
    expect(exception.getResponse()).toMatchObject({ issues: [] });
  });
});
