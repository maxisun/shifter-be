import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { buildErrorBody, ERROR_CODES } from './api-error.js';

describe('buildErrorBody', () => {
  it.each([
    [
      new BadRequestException(),
      HttpStatus.BAD_REQUEST,
      ERROR_CODES.validation,
      'Validation failed',
    ],
    [
      new UnauthorizedException(),
      HttpStatus.UNAUTHORIZED,
      ERROR_CODES.authenticationRequired,
      'Authentication required',
    ],
    [
      new ForbiddenException(),
      HttpStatus.FORBIDDEN,
      ERROR_CODES.accessDenied,
      'Access denied',
    ],
    [
      new NotFoundException(),
      HttpStatus.NOT_FOUND,
      ERROR_CODES.notFound,
      'Resource not found',
    ],
    [
      new ConflictException(),
      HttpStatus.CONFLICT,
      ERROR_CODES.conflict,
      'Conflict',
    ],
  ])('maps %s to the contract envelope', (exception, status, code, message) => {
    const built = buildErrorBody(exception, 'req-1');

    expect(built).toEqual({
      status,
      body: {
        code,
        message,
        issues: [],
        requestId: 'req-1',
      },
    });
  });

  it('preserves a Nest response message, including the unmatched route text', () => {
    const built = buildErrorBody(
      new NotFoundException('Cannot GET /nope'),
      'req-1',
    );

    expect(built.body.message).toBe('Cannot GET /nope');
  });

  it('preserves a feature-specific contract code and issues', () => {
    const exception = new HttpException(
      {
        code: 'SHIFT_NOT_OPEN',
        message: 'Shift is not open',
        issues: [
          { path: 'shiftId', code: 'state', message: 'Shift is filled' },
        ],
      },
      HttpStatus.CONFLICT,
    );

    expect(buildErrorBody(exception, 'req-1').body).toEqual({
      code: 'SHIFT_NOT_OPEN',
      message: 'Shift is not open',
      issues: [{ path: 'shiftId', code: 'state', message: 'Shift is filled' }],
      requestId: 'req-1',
    });
  });

  it('drops issues that do not match the contract shape', () => {
    const exception = new HttpException(
      {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        issues: [{ path: 'email' }, { path: 'name', code: 'x', message: 'y' }],
      },
      HttpStatus.BAD_REQUEST,
    );

    expect(buildErrorBody(exception, 'req-1').body.issues).toEqual([
      { path: 'name', code: 'x', message: 'y' },
    ]);
  });

  it('falls back to the status message when a custom code has no message', () => {
    const exception = new HttpException(
      { code: 'SHIFT_NOT_OPEN' },
      HttpStatus.CONFLICT,
    );

    expect(buildErrorBody(exception, 'req-1').body).toEqual({
      code: 'SHIFT_NOT_OPEN',
      message: 'Conflict',
      issues: [],
      requestId: 'req-1',
    });
  });

  it('uses a generic validation message when Nest supplies an array', () => {
    const exception = new BadRequestException({
      message: ['email must be an email'],
    });

    expect(buildErrorBody(exception, 'req-1').body.message).toBe(
      'Validation failed',
    );
  });

  it('never leaks an unexpected exception', () => {
    const built = buildErrorBody(
      new Error('postgres://user:secret@db/shifters failed'),
      'req-1',
    );

    expect(built).toEqual({
      status: 500,
      body: {
        code: ERROR_CODES.internal,
        message: 'Internal server error',
        issues: [],
        requestId: 'req-1',
      },
    });
  });

  it('keeps a generic 5xx HttpException opaque', () => {
    const built = buildErrorBody(
      new HttpException('upstream details', 503),
      'req-1',
    );

    expect(built.body.message).toBe('Internal server error');
    expect(built.body.code).toBe(ERROR_CODES.internal);
  });

  it('falls back to a generic non-5xx code', () => {
    const built = buildErrorBody(new HttpException('teapot', 418), 'req-1');

    expect(built.body).toMatchObject({
      code: 'REQUEST_FAILED',
      message: 'teapot',
    });
  });
});
