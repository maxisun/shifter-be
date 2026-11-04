import { redactLogText } from './log-sanitizer.js';

describe('redactLogText', () => {
  it('removes a presigned URL entirely', () => {
    expect(
      redactLogText(
        'download https://account.r2.cloudflarestorage.com/bucket/key?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef failed',
      ),
    ).toBe('download [REDACTED_URL] failed');
  });

  it('removes a bearer token', () => {
    expect(redactLogText('Authorization: Bearer abc.def-123')).toBe(
      'Authorization: Bearer [REDACTED]',
    );
  });

  it('removes key-value secrets from free text', () => {
    expect(redactLogText('failed password=hunter2&token=abc123&code=xyz')).toBe(
      'failed password=[REDACTED]&token=[REDACTED]&code=[REDACTED]',
    );
  });

  it('leaves ordinary messages alone', () => {
    expect(redactLogText('request completed in 12ms')).toBe(
      'request completed in 12ms',
    );
  });
});
