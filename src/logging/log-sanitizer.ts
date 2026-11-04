/**
 * Keys whose values must never reach a log sink. Pino redaction runs on
 * structured fields; request bodies and response bodies are never logged, so
 * these paths cover the objects the application itself logs.
 *
 * Depth is explicit because pino wildcards match one level at a time.
 */
export const SENSITIVE_LOG_PATHS = [
  'password',
  '*.password',
  '*.*.password',
  'newPassword',
  '*.newPassword',
  '*.*.newPassword',
  'token',
  '*.token',
  '*.*.token',
  'accessToken',
  '*.accessToken',
  '*.*.accessToken',
  'refreshToken',
  '*.refreshToken',
  '*.*.refreshToken',
  'authorization',
  '*.authorization',
  'cookie',
  '*.cookie',
  'set-cookie',
  '*.set-cookie',
  'licenseNumber',
  '*.licenseNumber',
  '*.*.licenseNumber',
  'tbOutcome',
  '*.tbOutcome',
  '*.*.tbOutcome',
  'tbTestResult',
  '*.tbTestResult',
  '*.*.tbTestResult',
  'documentContents',
  '*.documentContents',
  '*.*.documentContents',
  'signedUrl',
  '*.signedUrl',
  '*.*.signedUrl',
  'downloadUrl',
  '*.downloadUrl',
  '*.*.downloadUrl',
  'url',
  '*.url',
  '*.*.url',
  'body',
  '*.body',
] as const;

const REDACTED = '[REDACTED]';
const REDACTED_URL = '[REDACTED_URL]';

const signedUrlPattern =
  /https?:\/\/[^\s"'<>]*(?:X-Amz-Signature|X-Amz-Credential|X-Amz-Security-Token|sig=|signature=)[^\s"'<>]*/gi;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const keyValueSecretPattern =
  /\b(password|passwd|token|access_token|refresh_token|api[_-]?key|client_secret|code)=([^&\s,;]+)/gi;

/**
 * Last-resort scrubbing for free-form messages. Structured redaction is the
 * primary control; this keeps a signed URL or credential that slipped into an
 * exception message from being serialized verbatim.
 */
export function redactLogText(value: string): string {
  return value
    .replace(signedUrlPattern, REDACTED_URL)
    .replace(bearerPattern, `Bearer ${REDACTED}`)
    .replace(
      keyValueSecretPattern,
      (_match, key: string) => `${key}=${REDACTED}`,
    );
}
