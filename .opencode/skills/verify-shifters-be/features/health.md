# Health

`GET /health/live` answers 200 as soon as the process accepts requests and returns the request id. There is no database-pinging readiness endpoint.

## Sub-features

- `health-live` returns 200 and `{"status":"ok","requestId":"…"}` without touching PostgreSQL.
- `health-request-id` echoes a valid inbound `X-Request-Id`.

## How to get to it (user POV)

- Send `GET /health/live` to the launched base URL.

## Driving it with control.mjs

Preconditions:

- A launched instance whose `doctor` reports `Doctor: drivable`.
- No database dependency is required for this journey.

- **Liveness.** Assert the process answers without a database dependency. Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get /health/live \
    --save health-live \
    --expect-status 200 \
    --expect-body-contains '"status":"ok"' \
    --expect-header 'content-type=application/json; charset=utf-8'
  ```
  The body is `{"status":"ok","requestId":"…"}` and the header matches the body id.
- **Request id echo.** Send a valid id and assert the same value in the body:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get /health/live \
    --header 'x-request-id=trace-health-1' \
    --save health-request-id \
    --expect-status 200 \
    --expect-body-contains '"requestId":"trace-health-1"'
  ```
  The artifact's `x-request-id` header is `trace-health-1`.
- **Proof.** Keep the liveness and request-id artifacts. A 200 proves the process accepts requests; it does not prove database connectivity.

## Gotchas

- Liveness must not depend on PostgreSQL. If `/health/live` turns 503 during a database outage, an orchestrator will restart a healthy process and make the outage worse.
- There is deliberately no readiness route. Prove database-backed behavior through a feature route that uses PostgreSQL.
- The container `HEALTHCHECK` calls `/`, which proves only that the process is alive.
- `NODE_ENV=production` refuses to boot without `DATABASE_URL` and the complete `S3_*` group; those checks are startup configuration validation, not runtime connectivity.
