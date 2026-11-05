import type { IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';
import { httpLoggerOptions } from './http-logging.js';

const logger = pino({ level: 'silent' });

function request(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    method: 'GET',
    url: '/',
    headers: {},
    ...overrides,
  } as IncomingMessage;
}

function response() {
  return { setHeader: vi.fn() } as unknown as ServerResponse & {
    setHeader: ReturnType<typeof vi.fn>;
  };
}

describe('httpLoggerOptions', () => {
  it('keeps a valid inbound request id and sets the response header', () => {
    const options = httpLoggerOptions(logger);
    const res = response();

    const id = options.genReqId?.(
      request({ headers: { 'x-request-id': 'trace-12345678' } }),
      res,
    );

    expect(id).toBe('trace-12345678');
    expect(res.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      'trace-12345678',
    );
  });

  it('generates an id for an unsafe inbound header', () => {
    const options = httpLoggerOptions(logger);
    const res = response();

    const id = options.genReqId?.(request({ headers: {} }), res);

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', id);
  });

  it('omits the query string when serializing the request', () => {
    const options = httpLoggerOptions(logger);
    const serialized = options.serializers?.req?.(
      request({
        id: 'trace-12345678',
        url: '/verify-email?token=secret',
      }) as IncomingMessage & { id: string },
    );

    expect(serialized).toEqual({
      id: 'trace-12345678',
      method: 'GET',
      path: '/verify-email',
    });
  });

  it('handles a request with no url', () => {
    const options = httpLoggerOptions(logger);
    const serialized = options.serializers?.req?.(
      request({ id: 'trace-12345678', url: undefined }) as IncomingMessage & {
        id: string;
      },
    );

    expect(serialized).toEqual({
      id: 'trace-12345678',
      method: 'GET',
      path: undefined,
    });
  });

  it('adds the request id to every completion log', () => {
    const options = httpLoggerOptions(logger);
    expect(
      options.customProps?.(
        request({ id: 'trace-12345678' }) as IncomingMessage & { id: string },
        {} as ServerResponse,
      ),
    ).toEqual({ requestId: 'trace-12345678' });
  });

  it('chooses a level from the response status and errors', () => {
    const options = httpLoggerOptions(logger);

    expect(
      options.customLogLevel?.(request(), {
        statusCode: 200,
      } as ServerResponse),
    ).toBe('info');
    expect(
      options.customLogLevel?.(request(), {
        statusCode: 404,
      } as ServerResponse),
    ).toBe('warn');
    expect(
      options.customLogLevel?.(
        request(),
        { statusCode: 200 } as ServerResponse,
        new Error('boom'),
      ),
    ).toBe('error');
    expect(
      options.customLogLevel?.(request(), {
        statusCode: 503,
      } as ServerResponse),
    ).toBe('error');
  });

  it('does not access-log the liveness probe', () => {
    const options = httpLoggerOptions(logger);
    const ignore = options.autoLogging?.ignore;
    expect(ignore?.(request({ url: '/health/live' }))).toBe(true);
    expect(ignore?.(request({ url: '/health/live?x=1' }))).toBe(true);
    expect(ignore?.(request({ url: '/api/v1/shifts' }))).toBe(false);
  });
});
