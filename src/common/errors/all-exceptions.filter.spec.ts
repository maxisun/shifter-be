import {
  type ArgumentsHost,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Logger } from 'pino';
import { RequestContextService } from '../request-context.service.js';
import { REQUEST_ID_HEADER } from '../request-id.js';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function createHost(request: Partial<Request>) {
  const response = {
    status: vi.fn(),
    setHeader: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('AllExceptionsFilter', () => {
  it('writes the contract envelope and echoes the request id', () => {
    const logger = { warn: vi.fn(), error: vi.fn() } as unknown as Logger;
    const filter = new AllExceptionsFilter(logger, new RequestContextService());
    const { host, response } = createHost({
      id: 'trace-12345678',
      method: 'GET',
      originalUrl: '/nope?token=secret',
      url: '/nope?token=secret',
    } as Partial<Request>);

    filter.catch(new NotFoundException('Cannot GET /nope'), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      code: 'RESOURCE_NOT_FOUND',
      message: 'Cannot GET /nope',
      issues: [],
      requestId: 'trace-12345678',
    });
    expect(logger.warn).toHaveBeenCalledWith(
      {
        requestId: 'trace-12345678',
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        method: 'GET',
        path: '/nope',
      },
      'Request rejected',
    );
  });

  it('logs internal failures with the error but responds without it', () => {
    const logger = { warn: vi.fn(), error: vi.fn() } as unknown as Logger;
    const filter = new AllExceptionsFilter(logger, new RequestContextService());
    const { host, response } = createHost({
      id: 'trace-12345678',
      method: 'POST',
    } as Partial<Request>);

    filter.catch(new Error('database password was rejected'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      issues: [],
      requestId: 'trace-12345678',
    });
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: 'trace-12345678', status: 500 }),
      'Unhandled request error',
    );
  });

  it('mints one id when pino has not assigned one', () => {
    const logger = { warn: vi.fn(), error: vi.fn() } as unknown as Logger;
    const filter = new AllExceptionsFilter(logger, new RequestContextService());
    const { host, response } = createHost({
      method: 'GET',
      headers: {},
    } as Partial<Request>);

    filter.catch(new UnauthorizedException(), host);

    const headerId = response.setHeader.mock.calls.find(
      ([name]) => name === REQUEST_ID_HEADER,
    )?.[1];
    expect(headerId).toBeTruthy();
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: headerId }),
    );
  });
});
