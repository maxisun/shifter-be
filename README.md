# shifters-be

NestJS 12 HTTP API for ShiftPatch, built with TypeScript 6, native ESM, pnpm,
Biome, Vitest, PostgreSQL through Kysely, and an S3-compatible storage adapter
that points at Cloudflare R2 in deployed environments and MinIO locally.

The API contract is pinned from `maxisun/shifters-specs`. Generated types live
in `src/generated/api/schema.d.ts` and are never edited by hand.

## Quick start with containers

```bash
nvm install && pnpm install
cp .env.example .env       # local-only values; never commit it
docker compose up --build
```

Compose starts PostgreSQL, MinIO, a one-shot bucket creator, a migration job,
and the app. The app is at `http://localhost:3000`, MinIO's console at
`http://localhost:9001`, and the Node inspector at `localhost:9229`.

Check it:

```bash
curl -i http://localhost:3000/health/live
curl -i http://localhost:3000/health/ready
curl -i http://localhost:3000/
```

## Local process (no app container)

PostgreSQL and MinIO still come from compose:

```bash
docker compose up -d postgres minio minio-init
pnpm run db:migrate:build
pnpm run start:dev
```

`.env` is loaded by `@nestjs/config` for every `nest start` variant. Environment
variables already present in the shell win over file values. Production reads
only the process environment.

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /` | Stable 2xx route for the container healthcheck |
| `GET /health/live` | Process liveness; never touches PostgreSQL |
| `GET /health/ready` | `SELECT 1` against PostgreSQL; 200 up, 503 down |

Every response carries `X-Request-Id`, generated when the client does not send a
safe value. API errors use the contract's `{ code, message, issues, requestId }`
envelope for validation, unauthorized, forbidden, not found, conflict, and
internal failures. Feature controllers are mounted under the contract's
`/api/v1` prefix; operational routes (`/`, `/health/*`) stay at the origin.
Health probes return their own `{ status, checks, requestId }` payload, including
the 503 when PostgreSQL is down.

## Configuration

Copy `.env.example` and fill only what you need. Grouped integrations are
all-or-nothing; production startup fails when a required group is missing.

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Required in production |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Required in production; R2 uses `region=auto` |
| `S3_PUBLIC_ENDPOINT` | Presign host when it differs from the container endpoint (local MinIO) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO` | Optional; no-op sender without them |
| `POSTHOG_API_KEY`, `POSTHOG_HOST` | Optional; no-op analytics without a key |
| `LOG_LEVEL` | `fatal` through `trace`, default `info` |
| `PORT` | Default `3000` |
| `TRUST_PROXY` | `true` behind a TLS-terminating proxy |

Technical logs are structured JSON. Passwords, tokens, cookies, authorization
headers, license numbers, TB outcomes, document contents, signed URLs, request
query strings, and request/response bodies are redacted or never logged.

## Contract

```bash
pnpm run contract:verify    # URL, version, digest, manifest, work items
pnpm run contract:generate  # rewrite src/generated/api/schema.d.ts
pnpm run contract:check     # fail when generated types drift
```

The contract dependency is an exact GitHub release-asset URL. `pnpm-lock.yaml`
records its `integrity`; `contracts/work-spec.lock.json` records the ticket-set
tag and commit. Update both only through a reviewed pull request.

## Database

Kysely migrations are compiled with the app.

```bash
pnpm run db:migrate:build   # build + apply pending migrations
pnpm run db:migrate         # apply to an already-built dist/
```

Migrations run as a separate compose service before the app starts. A deployed
environment should run them as a release step, not from every app replica.

## Object storage smoke test

MinIO is the local stand-in and uses the same adapter as R2:

```bash
pnpm run storage:smoke:r2
```

Against a real R2 bucket, export the production `S3_*` variables first. The
command performs put, presign, a signed GET, streaming get, delete, and a
post-delete read, and prints no URL or credential.

## Commands

| Task | Command |
| --- | --- |
| Dev server | `pnpm run start:dev` |
| Build | `pnpm run build` |
| Production | `pnpm run start:prod` |
| Unit tests | `pnpm run test` |
| Coverage | `pnpm run test:cov` |
| E2E tests | `pnpm run test:e2e` |
| Lint, format, imports | `pnpm run check` (`--write` to fix) |
| Build production image | `docker build -t shifters-be:production .` |

The pre-commit gate is:

```bash
pnpm run check && pnpm run build && pnpm run test && pnpm run test:e2e
```

## Deployment

The production image runs `node dist/main.js` as the `node` user and keeps a
`HEALTHCHECK` on `GET /`. Provide `DATABASE_URL` and the `S3_*` group through
deployment secrets, run `node dist/database/migrate.js` as a release step, and
terminate TLS at the platform or reverse proxy. The repository does not yet fix
a hosting vendor; see [`docs/deployment.md`](docs/deployment.md) for the exact
checklist and the external proof still outstanding.

## Verification

`.opencode/skills/verify-shifters-be/` contains the HTTP verification harness.
It launches the built artifact on an isolated port and stores each request and
response under `.verify/runs/<run-id>/artifacts/` as evidence.
