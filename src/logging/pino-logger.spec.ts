import type { DestinationStream } from 'pino';
import { loadConfig } from '../config/config.js';
import { createPinoLogger } from './pino-logger.js';

function capture() {
  const lines: Record<string, unknown>[] = [];
  const destination: DestinationStream = {
    write(line: string) {
      lines.push(JSON.parse(line) as Record<string, unknown>);
    },
  };
  return { lines, destination };
}

describe('createPinoLogger', () => {
  it('writes structured fields and redacts sensitive object keys', () => {
    const { lines, destination } = capture();
    const logger = createPinoLogger(
      loadConfig({ NODE_ENV: 'test' }),
      destination,
    );

    logger.info(
      {
        password: 'hunter2',
        token: 'abc',
        licenseNumber: 'RN-123',
        tbOutcome: 'negative',
        documentContents: 'bytes',
        download: { url: 'https://example.test/file?sig=secret' },
      },
      'sensitive payload',
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      service: 'shifters-be',
      environment: 'test',
      msg: 'sensitive payload',
    });
    expect(lines[0]?.password).toBe('[REDACTED]');
    expect(lines[0]?.token).toBe('[REDACTED]');
    expect(lines[0]?.licenseNumber).toBe('[REDACTED]');
    expect(lines[0]?.tbOutcome).toBe('[REDACTED]');
    expect(lines[0]?.documentContents).toBe('[REDACTED]');
    expect(lines[0]?.download).toEqual({ url: '[REDACTED]' });
  });

  it('defaults to stdout when no destination is supplied', () => {
    const logger = createPinoLogger(loadConfig({ NODE_ENV: 'test' }));
    expect(logger.level).toBe('info');
  });

  it('sanitizes an error message and stack before serialization', () => {
    const { lines, destination } = capture();
    const logger = createPinoLogger(
      loadConfig({ NODE_ENV: 'test' }),
      destination,
    );

    logger.error(
      {
        err: new Error(
          'GET https://account.r2.cloudflarestorage.com/b/key?X-Amz-Signature=secret failed',
        ),
      },
      'request failed',
    );

    const serialized = lines[0]?.err as { message: string; stack: string };
    expect(serialized.message).toContain('[REDACTED_URL]');
    expect(serialized.message).not.toContain('secret');
    expect(serialized.stack).toContain('[REDACTED_URL]');
  });

  it('sanitizes free-form messages that contain a signed URL', () => {
    const { lines, destination } = capture();
    const logger = createPinoLogger(
      loadConfig({ NODE_ENV: 'test' }),
      destination,
    );

    logger.warn(
      'GET https://account.r2.cloudflarestorage.com/b/key?X-Amz-Signature=secret failed',
    );

    expect(lines[0]?.msg).toContain('[REDACTED_URL]');
    expect(lines[0]?.msg).not.toContain('secret');
  });
});
