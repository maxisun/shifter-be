import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');

export const STORAGE_ENV_KEYS = [
  'S3_ENDPOINT',
  'S3_BUCKET',
  'S3_ACCESS_KEY_ID',
  'S3_SECRET_ACCESS_KEY',
] as const;

export const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface StorageConfig {
  endpoint: string;
  publicEndpoint?: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface EmailConfig {
  apiKey: string;
  from: string;
  replyTo?: string;
}

export interface PostHogConfig {
  apiKey: string;
  host: string;
}

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  port: number;
  logLevel: LogLevel;
  trustProxy: boolean;
  databaseUrl?: string;
  storage?: StorageConfig;
  email?: EmailConfig;
  posthog?: PostHogConfig;
}

const optionalString = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.string().min(1).optional(),
);

const booleanFromEnv = (defaultValue: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(defaultValue ? 'true' : 'false')
    .transform((value) => value === 'true' || value === '1');

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(NODE_ENVIRONMENTS).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
    TRUST_PROXY: booleanFromEnv(false),
    DATABASE_URL: optionalString,
    S3_ENDPOINT: optionalString,
    S3_PUBLIC_ENDPOINT: optionalString,
    S3_REGION: optionalString,
    S3_BUCKET: optionalString,
    S3_ACCESS_KEY_ID: optionalString,
    S3_SECRET_ACCESS_KEY: optionalString,
    RESEND_API_KEY: optionalString,
    EMAIL_FROM: optionalString,
    EMAIL_REPLY_TO: optionalString,
    POSTHOG_API_KEY: optionalString,
    POSTHOG_HOST: z
      .preprocess(
        (value) => (value === '' || value === undefined ? undefined : value),
        z.string().url().optional(),
      )
      .transform((value) => value ?? 'https://us.i.posthog.com'),
  })
  .superRefine((environment, context) => {
    const configuredStorage = STORAGE_ENV_KEYS.filter(
      (key) => environment[key],
    ).length;
    if (configuredStorage > 0 && configuredStorage < STORAGE_ENV_KEYS.length) {
      const missing = STORAGE_ENV_KEYS.filter((key) => !environment[key]);
      context.addIssue({
        code: 'custom',
        path: ['S3_ENDPOINT'],
        message: `Object storage is partially configured; missing ${missing.join(', ')}`,
      });
    }

    const emailConfigured = Boolean(
      environment.RESEND_API_KEY || environment.EMAIL_FROM,
    );
    if (
      emailConfigured &&
      !(environment.RESEND_API_KEY && environment.EMAIL_FROM)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message:
          'Email is partially configured; set both RESEND_API_KEY and EMAIL_FROM',
      });
    }
  });

/**
 * Turns process environment variables into the typed application config.
 * Grouped integrations are all-or-nothing; production presence is asserted
 * separately by `assertRuntimeConfig` so one-off tools (migrations) can load
 * the same config without storage or email credentials.
 */
export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig {
  const parsed = environmentSchema.parse(environment);

  const endpoint = parsed.S3_ENDPOINT;
  const bucket = parsed.S3_BUCKET;
  const accessKeyId = parsed.S3_ACCESS_KEY_ID;
  const secretAccessKey = parsed.S3_SECRET_ACCESS_KEY;
  const storage =
    endpoint && bucket && accessKeyId && secretAccessKey
      ? {
          endpoint,
          publicEndpoint: parsed.S3_PUBLIC_ENDPOINT,
          region: parsed.S3_REGION ?? 'auto',
          bucket,
          accessKeyId,
          secretAccessKey,
        }
      : undefined;

  return {
    nodeEnv: parsed.NODE_ENV,
    port: parsed.PORT,
    logLevel: parsed.LOG_LEVEL,
    trustProxy: parsed.TRUST_PROXY,
    databaseUrl: parsed.DATABASE_URL,
    storage,
    email:
      parsed.RESEND_API_KEY && parsed.EMAIL_FROM
        ? {
            apiKey: parsed.RESEND_API_KEY,
            from: parsed.EMAIL_FROM,
            replyTo: parsed.EMAIL_REPLY_TO,
          }
        : undefined,
    posthog: parsed.POSTHOG_API_KEY
      ? { apiKey: parsed.POSTHOG_API_KEY, host: parsed.POSTHOG_HOST }
      : undefined,
  };
}

/**
 * Production must read only the process environment; tests must never inherit
 * a developer's real dependencies. Local development loads .env files.
 */
export function shouldIgnoreEnvFile(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return nodeEnv === 'production' || nodeEnv === 'test';
}

/**
 * Fails fast when the service itself is started without the dependencies a
 * deployed environment must have. Local development may run without them and
 * relies on readiness checks and explicit adapter errors instead.
 */
export function assertRuntimeConfig(config: AppConfig): void {
  if (config.nodeEnv !== 'production') return;

  const missing: string[] = [];
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if (!config.storage) {
    missing.push(...STORAGE_ENV_KEYS);
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required production configuration: ${missing.join(', ')}`,
    );
  }
}
