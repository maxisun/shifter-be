import {
  isValidRequestId,
  REQUEST_ID_HEADER,
  requestIdFromRequest,
  resolveRequestId,
} from './request-id.js';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('request ids', () => {
  it('keeps a bounded client id', () => {
    expect(resolveRequestId('trace-12345678')).toBe('trace-12345678');
  });

  it('uses the first array value', () => {
    expect(resolveRequestId(['trace-12345678', 'other'])).toBe(
      'trace-12345678',
    );
  });

  it.each([
    ['short', 'abc'],
    ['too long', 'a'.repeat(129)],
    ['control characters', 'trace-1234\n56'],
    ['spaces', 'trace 12345678'],
  ])('replaces an unsafe id (%s) with a uuid', (_name, value) => {
    expect(resolveRequestId(value)).toMatch(UUID_PATTERN);
  });

  it('generates a uuid when no header was sent', () => {
    expect(resolveRequestId(undefined)).toMatch(UUID_PATTERN);
  });

  it('validates only strings', () => {
    expect(isValidRequestId('trace-12345678')).toBe(true);
    expect(isValidRequestId(42)).toBe(false);
    expect(isValidRequestId(undefined)).toBe(false);
  });

  it('reads the id pino assigned', () => {
    expect(
      requestIdFromRequest({
        id: 'trace-12345678',
        headers: { [REQUEST_ID_HEADER]: 'header-value' },
      }),
    ).toBe('trace-12345678');
  });

  it('falls back to a valid inbound header', () => {
    expect(
      requestIdFromRequest({
        headers: { [REQUEST_ID_HEADER]: 'trace-abcdefgh' },
      }),
    ).toBe('trace-abcdefgh');
  });

  it('reads an array header', () => {
    expect(
      requestIdFromRequest({
        headers: { [REQUEST_ID_HEADER]: ['trace-abcdefgh', 'ignored'] },
      }),
    ).toBe('trace-abcdefgh');
  });

  it('returns undefined rather than minting a second id', () => {
    expect(requestIdFromRequest({ headers: {} })).toBeUndefined();
    expect(
      requestIdFromRequest({ headers: { [REQUEST_ID_HEADER]: 'bad' } }),
    ).toBeUndefined();
  });
});
