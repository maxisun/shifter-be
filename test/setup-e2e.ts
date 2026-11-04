process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';

// Never let a developer's local .env point the e2e suite at a real database
// or bucket. Tests that need a database override the provider explicitly.
delete process.env.DATABASE_URL;
delete process.env.S3_ENDPOINT;
delete process.env.S3_BUCKET;
delete process.env.S3_ACCESS_KEY_ID;
delete process.env.S3_SECRET_ACCESS_KEY;
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_FROM;
delete process.env.POSTHOG_API_KEY;
