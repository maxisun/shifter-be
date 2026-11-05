---
description: Cross-cutting infrastructure that is already wired
applyTo: "**/*"
---

## Cross-cutting infrastructure

Cross-cutting infrastructure is already wired and should be reused rather than re-created:

- `AppConfigModule` (`src/config/`) loads `.env.local` then `.env` in local development, validates with Zod, and provides the `APP_CONFIG` token. Production and tests ignore env files; production startup also calls `assertRuntimeConfig`.
- `AppLoggingModule` provides the pino `PINO_LOGGER` and Nest's `AppLogger`. Use `RequestContextService` to read the request id or the authenticated user; never log request bodies, query strings, tokens, license numbers, TB outcomes, document bytes, or signed URLs.
- `AllExceptionsFilter` (`src/common/errors/`) renders every API failure through the contract's `Error` envelope. Do not add a second API error shape; the liveness probe intentionally returns `{ status, requestId }` so orchestrators can read it without parsing an error.
- `configureApp` mounts feature controllers under `/api/v1` (the contract's `servers` URL) and excludes `/` and `/health/*`. `installNotFoundHandler` runs after `app.init()` so unmatched paths outside the prefix still reach the same filter.
- `DatabaseService` exposes typed Kysely through its `db` getter (`types/database-schema.ts`).
- `StorageService` is the public storage interface: inject it. It owns key, content-type, length, cache, and TTL policy. `ObjectStorage` is an internal port; `StorageModule` selects the S3/R2 or unconfigured adapter, and the in-memory adapter is a test double. Biome rejects `@aws-sdk/*` or adapter imports outside `src/storage/**`.
- `EMAIL_SENDER` and `ANALYTICS_CLIENT` are global injection tokens. Email and analytics are safe no-ops when unconfigured.
- `src/generated/api/schema.d.ts` is generated from the pinned contract. Never edit it by hand; change the contract and adopt a new release instead.
