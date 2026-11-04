# Health and readiness

`GET /health/live` answers 200 as soon as the process accepts requests. `GET /health/ready` performs a real `SELECT 1` against PostgreSQL and answers 200 with `checks.database = "up"`, or 503 with `"down"` when the database is missing, refuses the connection, or does not answer within two seconds. Both responses carry the request id.

## Sub-features

- `health-live` returns 200 and `{"status":"ok","requestId":"…"}` without touching PostgreSQL.
- `health-ready-up` returns 200 and `{"status":"ok","checks":{"database":"up"}}`.
- `health-ready-down` returns 503 and `{"status":"error","checks":{"database":"down"}}` when the database is unreachable.
- `health-request-id` echoes a valid inbound `X-Request-Id` on both routes.

## How to get to it (user POV)

- Send `GET /health/live` to the launched base URL.
- Send `GET /health/ready` when the compose PostgreSQL service is running and migrated.
- Send `GET /health/ready` when the configured database is unreachable.

## Driving it with control.mjs

Preconditions:

- Compose PostgreSQL and MinIO are up, `.env` is exported, and migrations have applied; see the baseline in `README.md`.
- `control.mjs doctor` reports `Doctor: drivable` for the run about to be used.

- **Liveness.** Assert the process answers without a database dependency. Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get /health/live \
    --save health-live \
    --expect-status 200 \
    --expect-body-contains '"status":"ok"' \
    --expect-header 'content-type=application/json; charset=utf-8'
  ```
  The body is `{"status":"ok","requestId":"…"}` and the header matches the body id.
- **Readiness up.** Assert a real PostgreSQL round trip. Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get /health/ready \
    --save health-ready-up \
    --expect-status 200 \
    --expect-body-contains '"database":"up"'
  ```
  The body is `{"status":"ok","checks":{"database":"up"},"requestId":"…"}`.
- **Readiness down.** Stop the normal run, then start a second run pointed at a closed port while keeping the rest of the production config valid:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs stop
  DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5999/shifters \
    .opencode/skills/verify-shifters-be/scripts/control.mjs launch --port 3321
  .opencode/skills/verify-shifters-be/scripts/control.mjs get /health/ready \
    --save health-ready-down \
    --expect-status 503 \
    --expect-body-contains '"database":"down"'
  ```
  The app still boots because production config checks presence, not reachability; readiness is the honest signal. Stop this run and relaunch the normal one before continuing other journeys:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs stop
  .opencode/skills/verify-shifters-be/scripts/control.mjs launch
  ```
- **Request id echo.** Send a valid id and assert the same value in the body:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get /health/live \
    --header 'x-request-id=trace-health-1' \
    --save health-request-id \
    --expect-status 200 \
    --expect-body-contains '"requestId":"trace-health-1"'
  ```
  The artifact's `x-request-id` header is `trace-health-1`.
- **Proof.** Keep both readiness artifacts. The 200 and 503 pair is the evidence that readiness reflects PostgreSQL, not merely the process.

## Gotchas

- Liveness must not depend on PostgreSQL. If `/health/live` turns 503 during a database outage, an orchestrator will restart a healthy process and make the outage worse.
- The readiness timeout is two seconds and the pool connection timeout is three; a black-holed address can take that long before the 503 arrives. That is not a hang.
- `NODE_ENV=production` refuses to boot without `DATABASE_URL` and the complete `S3_*` group, so the "down" run still needs valid-looking values. Pointing `DATABASE_URL` at a closed local port is the controlled way to make readiness fail.
- A 200 from `/` proves only the process. Always use `/health/ready` for the database claim.
- The container `HEALTHCHECK` still calls `/`; it answers 2xx while the process is alive even if PostgreSQL is down. Readiness is deliberately separate.
