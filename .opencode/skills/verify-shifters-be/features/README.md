# shifters-be verification map

This directory is the maintained source for verifying the user-facing behavior of the shifters-be API. Read this index before driving the app, then use the matching feature file as the recipe.

The surface is HTTP: a user is a client with a base URL. The API exposes `GET /` and `GET /health/live`; Express also answers `HEAD /` through that route. Contract operations are mounted under `/api/v1`; operational routes stay at the origin. Unmatched requests receive the contract error envelope `{ code, message, issues, requestId }`, as do validation, authentication, authorization, conflict, and internal failures once their routes exist. Every response carries `X-Request-Id`, and technical logs are structured JSON with the same id. The production artifact is a multi-stage Docker image. The walking-skeleton ticket (repo-root-relative path: `../shifters-specs/.scratch/shiftpatch-mvp/issues/02-backend-walking-skeleton.md`) also adds PostgreSQL, migrations, contract-generated types, storage/email/analytics adapters, and MinIO in compose; the MVP tickets behind it add auth, shifts, claims, credentials, timesheets, and exports. Add a feature file for each capability as it lands, and keep the journeys honest about what exists.

## Baseline preconditions

- Node from `.nvmrc` (26.13): `source ~/.nvm/nvm.sh && nvm use`.
- Dependencies installed: `pnpm install` when `node_modules/` is missing or the lockfile changed.
- Docker context reachable (`docker --context colima info`), then PostgreSQL, MinIO, and the bucket are up:
  ```bash
  docker --context colima compose up -d postgres minio minio-init
  ```
- Local environment exported into the shell. The harness starts `node dist/main.js` with `NODE_ENV=production`, which intentionally reads only the process environment:
  ```bash
  set -a; . ./.env; set +a
  ```
  `.env` is local-only and never committed. If it does not exist, copy `.env.example` first.
- The schema is current: `pnpm run db:migrate:build`.
- A launched instance whose `doctor` reports `Doctor: drivable`.
- No other process on the verification port. `launch` refuses a busy port.
- Never drive an instance this run did not start, and never assume port 3000. A dev server, a compose service, or another agent may own it.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Treat every command as literal. Keep quoted bodies and flags unchanged.
- Address the instance by the URL `doctor` prints.
- Assert on route, method, status, `content-type`, `content-length`, and body. `date`, `etag`, `keep-alive`, and `x-powered-by` are incidental and must not appear in an assertion.
- Save one artifact per user action under a name that names the action, not the outcome.
- The app may log startup and request lines to `.verify/runs/<run-id>/app.log`; use it to prove request ids and redaction, and save the filtered excerpt as an artifact.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final body.
- HTTP proof is the `.http.txt` artifact produced in the same run as the claim.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.
- Unit and e2e tests support a claim; they never replace the artifact.
- When a journey fails because a precondition is missing (Docker context down, no database), say which precondition and which command failed. Never weaken the assertion to make the journey pass.
- External credentials are not assumed. A real R2 smoke or an HTTPS deployment is reported as skipped, with the exact command and the missing credential, when the environment does not provide them.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with <harness>` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Root endpoint](./root-endpoint.md) covers `GET /` and `HEAD /`, the body and content type, and the envelope returned for unmatched requests.
- [Health](./health.md) covers process liveness and request-id echo.
- [Request context and errors](./request-context-and-errors.md) covers request-id echo/generation, the error envelope, and log redaction.
- [Object storage](./object-storage.md) covers put, presign, get, and delete through the S3-compatible adapter against local MinIO.
- [Production container](./production-container.md) covers building the image, running it against compose PostgreSQL/MinIO, and its self-reported healthcheck.
