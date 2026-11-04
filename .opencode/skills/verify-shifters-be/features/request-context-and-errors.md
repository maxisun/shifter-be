# Request context and errors

Every request receives an `X-Request-Id`, echoed when the client sends a valid token and generated otherwise. Every failure leaves the API through the contract envelope `{ code, message, issues, requestId }`. Technical logs are structured JSON with the same request id; request bodies and query strings are never logged, and known sensitive fields are redacted.

## Sub-features

- `request-id-echo` keeps a valid inbound `X-Request-Id` and returns it in the header and error/health bodies.
- `request-id-generated` returns a UUID when the client sends none.
- `request-id-unsafe` replaces a malformed id with a UUID.
- `error-not-found` returns 404 with `RESOURCE_NOT_FOUND` for an unmatched path.
- `error-wrong-method` returns 404 (not 405) with the same envelope for an unmatched method.
- `error-request-id` puts the response header's id in the body.
- `log-redaction` omits the query string and keeps the request id in the access log.

Validation (400), unauthorized (401), forbidden (403), and conflict (409) are mapped by the same filter but have no shipped route yet; the e2e suite proves those mappings through a test-only controller. Do not claim them over the launched API until a feature route produces them.

## How to get to it (user POV)

- Send a request with `X-Request-Id: trace-…`.
- Send a request without the header.
- Send `GET` to a path the app does not route.
- Send an unsupported method to a routed path.
- Send a request whose query string contains a would-be secret and inspect the technical log.

## Driving it with control.mjs

Preconditions:

- `control.mjs doctor` reports `Doctor: drivable` for the run about to be used.
- The run was launched by this verification run.

- **Echo a valid id.** Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get /health/live \
    --header 'x-request-id=trace-client-1' \
    --save request-id-echo \
    --expect-status 200 \
    --expect-body-contains '"requestId":"trace-client-1"' \
    --expect-header 'x-request-id=trace-client-1'
  ```
  Both the body and the `x-request-id` header carry `trace-client-1`; the artifact records the request header and the response.
- **Generate an id.** Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get /health/live \
    --save request-id-generated \
    --expect-status 200
  ```
  The artifact's `x-request-id` is a UUID. The body's `requestId` must equal it; check the two lines in the artifact.
- **Replace an unsafe id.** Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get /health/live \
    --header 'x-request-id=bad id with spaces' \
    --save request-id-unsafe \
    --expect-status 200
  ```
  The response header is a UUID, not the supplied text.
- **Unknown path.** Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get /nope \
    --header 'x-request-id=trace-error-1' \
    --save error-not-found \
    --expect-status 404 \
    --expect-body-contains '"code":"RESOURCE_NOT_FOUND"' \
    --expect-body-contains '"requestId":"trace-error-1"'
  ```
  The envelope has exactly `code`, `message`, `issues`, and `requestId`.
- **Wrong method.** Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get / \
    --method POST \
    --header 'x-request-id=trace-error-2' \
    --save error-wrong-method \
    --expect-status 404 \
    --expect-body-contains '"code":"RESOURCE_NOT_FOUND"'
  ```
  A 405 is a behavior change.
- **Log redaction.** Send a query string that must not appear in technical logs:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get '/?token=super-secret' \
    --header 'x-request-id=trace-log-1' \
    --save log-redaction-request \
    --expect-status 200
  RUN_ID=$(cat .verify/current)
  grep -F 'trace-log-1' ".verify/runs/$RUN_ID/app.log" | tail -1 \
    > ".verify/runs/$RUN_ID/artifacts/log-redaction.jsonl"
  if grep -Fq 'super-secret' ".verify/runs/$RUN_ID/artifacts/log-redaction.jsonl"; then
    echo 'FAIL query string leaked into the log'
    exit 1
  fi
  ```
  The saved line is JSON with `requestId: "trace-log-1"`, `path: "/"`, and no query string.
- **Proof.** Keep the HTTP artifacts plus `log-redaction.jsonl`. The request header proves the action; the response and log prove the state.

## Gotchas

- A client id is accepted only when it is 8–128 characters from `[A-Za-z0-9._:-]`. Shorter, longer, or spaced values are replaced. That is deliberate; do not "fix" a UUID response to an unsafe input.
- The access log is written when the response completes. Read it after the request, not before.
- `/health/live` and `/health/ready` are deliberately excluded from access logging to keep readiness probes out of operational logs. Use `/` or a feature route when proving access-log redaction.
- `--expect-header` is case-insensitive on the header name but exact on the value. A generated UUID cannot be asserted in advance; compare it to the body in the artifact instead.
- The 404 message still says `Cannot GET /nope`; the code and envelope, not the wording, are the contract.
- Validation, 401, 403, and 409 responses are exercised in `test/errors.e2e-spec.ts`. They become drivable routes with their feature tickets.
