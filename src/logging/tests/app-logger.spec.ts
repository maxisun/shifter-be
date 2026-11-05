import type { DestinationStream } from 'pino';
import { RequestContextService } from '../../common/request-context.service.js';
import { loadConfig } from '../../config/config.js';
import { createPinoLogger } from '../pino-logger.js';
import { AppLogger } from '../services/app-logger.js';

function setup() {
  const lines: Record<string, unknown>[] = [];
  const destination: DestinationStream = {
    write(line: string) {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  };
  const logger = createPinoLogger(
    loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'trace' }),
    destination,
  );
  const context = new RequestContextService();
  return { lines, appLogger: new AppLogger(logger, context), context };
}

describe('AppLogger', () => {
  it('correlates Nest logs with the current request', () => {
    const { lines, appLogger, context } = setup();

    context.run({ requestId: 'trace-12345678' }, () => {
      appLogger.log('request handled', 'ShiftsService');
    });

    expect(lines[0]).toMatchObject({
      requestId: 'trace-12345678',
      context: 'ShiftsService',
      msg: 'request handled',
    });
  });

  it('logs error objects through pino serialization', () => {
    const { lines, appLogger } = setup();

    appLogger.error(new Error('connection refused'), 'DatabaseService');

    expect(lines[0]).toMatchObject({
      context: 'DatabaseService',
      msg: 'connection refused',
    });
    expect(lines[0]?.err).toMatchObject({ message: 'connection refused' });
  });

  it('logs structured details and maps verbose to trace', () => {
    const { lines, appLogger } = setup();

    appLogger.log({ shiftId: 'shift-1' });
    appLogger.verbose('very detailed');

    expect(lines[0]?.detail).toEqual({ shiftId: 'shift-1' });
    expect(lines[1]?.level).toBe('trace');
  });

  it('supports warn, debug and fatal levels', () => {
    const { lines, appLogger } = setup();

    appLogger.warn('w');
    appLogger.debug('d');
    appLogger.fatal('f');

    expect(lines.map((line) => line.level)).toEqual(['warn', 'debug', 'fatal']);
  });
});
