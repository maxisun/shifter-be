import {
  assertRuntimeConfig,
  loadConfig,
  shouldIgnoreEnvFile,
} from './config.js';

describe('loadConfig', () => {
  it('applies safe local defaults', () => {
    const config = loadConfig({});

    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3000,
      logLevel: 'info',
      trustProxy: false,
      databaseUrl: undefined,
      storage: undefined,
      email: undefined,
      posthog: undefined,
    });
  });

  it('reads a complete environment', () => {
    const config = loadConfig({
      NODE_ENV: 'production',
      PORT: '8080',
      LOG_LEVEL: 'debug',
      TRUST_PROXY: 'true',
      DATABASE_URL: 'postgres://user:pass@db:5432/shifters',
      S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
      S3_REGION: 'auto',
      S3_BUCKET: 'shiftpatch',
      S3_ACCESS_KEY_ID: 'access',
      S3_SECRET_ACCESS_KEY: 'secret',
      RESEND_API_KEY: 'resend',
      EMAIL_FROM: 'no-reply@example.test',
      POSTHOG_API_KEY: 'phc_test',
      POSTHOG_HOST: 'https://eu.i.posthog.com',
    });

    expect(config).toEqual({
      nodeEnv: 'production',
      port: 8080,
      logLevel: 'debug',
      trustProxy: true,
      databaseUrl: 'postgres://user:pass@db:5432/shifters',
      storage: {
        endpoint: 'https://account.r2.cloudflarestorage.com',
        publicEndpoint: undefined,
        region: 'auto',
        bucket: 'shiftpatch',
        accessKeyId: 'access',
        secretAccessKey: 'secret',
      },
      email: {
        apiKey: 'resend',
        from: 'no-reply@example.test',
        replyTo: undefined,
      },
      posthog: {
        apiKey: 'phc_test',
        host: 'https://eu.i.posthog.com',
      },
    });
  });

  it('treats empty optional values as absent', () => {
    const config = loadConfig({
      DATABASE_URL: '',
      S3_ENDPOINT: '',
      RESEND_API_KEY: '',
      POSTHOG_API_KEY: '',
    });

    expect(config.databaseUrl).toBeUndefined();
    expect(config.storage).toBeUndefined();
    expect(config.email).toBeUndefined();
    expect(config.posthog).toBeUndefined();
  });

  it('rejects partially configured object storage', () => {
    expect(() =>
      loadConfig({
        S3_ENDPOINT: 'http://localhost:9000',
        S3_BUCKET: 'shiftpatch',
      }),
    ).toThrow(/partially configured.*S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY/);
  });

  it('rejects partially configured email', () => {
    expect(() => loadConfig({ EMAIL_FROM: 'no-reply@example.test' })).toThrow(
      /both RESEND_API_KEY and EMAIL_FROM/,
    );
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow(/PORT/);
  });
});

describe('shouldIgnoreEnvFile', () => {
  it.each([
    ['production', true],
    ['test', true],
    ['development', false],
  ])('%s -> %s', (nodeEnv, expected) => {
    expect(shouldIgnoreEnvFile(nodeEnv)).toBe(expected);
  });

  it('loads files when NODE_ENV is absent', () => {
    const previous = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      expect(shouldIgnoreEnvFile()).toBe(false);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

describe('assertRuntimeConfig', () => {
  it('does not require integrations outside production', () => {
    expect(() =>
      assertRuntimeConfig(loadConfig({ NODE_ENV: 'development' })),
    ).not.toThrow();
  });

  it('requires the database and storage in production', () => {
    expect(() =>
      assertRuntimeConfig(loadConfig({ NODE_ENV: 'production' })),
    ).toThrow(
      'Missing required production configuration: DATABASE_URL, S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY',
    );
  });

  it('accepts a fully configured production environment', () => {
    expect(() =>
      assertRuntimeConfig(
        loadConfig({
          NODE_ENV: 'production',
          DATABASE_URL: 'postgres://user:pass@db:5432/shifters',
          S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
          S3_BUCKET: 'shiftpatch',
          S3_ACCESS_KEY_ID: 'access',
          S3_SECRET_ACCESS_KEY: 'secret',
        }),
      ),
    ).not.toThrow();
  });
});
