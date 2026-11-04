# Root endpoint

`GET /` answers 200 with `Hello World!`. Express also routes `HEAD /` through the GET handler and suppresses the response body; unmatched requests such as `GET /nope` and `POST /` receive the contract error envelope with a `RESOURCE_NOT_FOUND` code and the response's request id. The production image's `HEALTHCHECK` fetches `/` and exits non-zero on anything but a 2xx, so a change here can mark a deployed container unhealthy.

## Sub-features

- `root-200` returns 200 to `GET /` on a freshly launched instance.
- `root-body` returns exactly `Hello World!` — 12 bytes, no trailing newline.
- `root-content-type` returns `text/html; charset=utf-8`, Nest's default for a returned string.
- `root-head` returns 200 to `HEAD /` with the GET representation headers and no body.
- `root-unknown-path` returns the error envelope for a path the app does not route.
- `root-wrong-method` returns 404, not 405, for `POST /`, in the same envelope.

## How to get to it (user POV)

- Send `GET /` to the launched base URL.
- Send `HEAD /` to the launched base URL.
- Send `GET` to any path the app does not route.
- Send an unsupported method such as `POST` to `/`.

## Driving it with control.mjs

Preconditions:

- `control.mjs doctor` reports `Doctor: drivable` for the run about to be used.
- The run's port is free of other listeners; `doctor` proves ownership.
- The instance was launched by this verification run, not by a dev server.

- **Root answers with the exact representation.** Request the root route and assert status, body, content type, and length in one exchange. Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get / \
    --save root \
    --expect-status 200 \
    --expect-body 'Hello World!' \
    --expect-header 'content-type=text/html; charset=utf-8' \
    --expect-header 'content-length=12'
  ```
  All four `PASS` lines print, and the artifact's `content-length: 12` matches the body.
- **HEAD request.** Request the root with `HEAD` and assert the representation headers plus an empty body. Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get / \
    --method HEAD \
    --save head-root \
    --expect-status 200 \
    --expect-header 'content-length=12' \
    --expect-header 'content-type=text/html; charset=utf-8' \
    --expect-body ''
  ```
  The response is 200, includes `content-length: 12` and `content-type: text/html; charset=utf-8`, and has no body.
- **Unknown path.** Request a path nothing routes. Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get /nope \
    --save unknown-route \
    --expect-status 404 \
    --expect-body-contains '"code":"RESOURCE_NOT_FOUND"'
  ```
  The artifact body is `{"code":"RESOURCE_NOT_FOUND","message":"Cannot GET /nope","issues":[],"requestId":"…"}` and the request id matches the `x-request-id` header.
- **Wrong method.** Request the root with a non-GET method. Run:
  ```bash
  .opencode/skills/verify-shifters-be/scripts/control.mjs get / \
    --method POST \
    --save wrong-method \
    --expect-status 404 \
    --expect-body-contains '"code":"RESOURCE_NOT_FOUND"'
  ```
  A 405 is a behavior change, not a pass.
- **Proof.** After `control.mjs stop`, confirm the artifacts still exist. Run:
  ```bash
  RUN_ID=$(cat .verify/current)
  ls -l ".verify/runs/$RUN_ID/artifacts"/{root,head-root,unknown-route,wrong-method}.http.txt
  ```
  The artifacts, not this file, are the evidence.

## Gotchas

- The body has no trailing newline. `curl` output and terminal rendering hide this; use `--expect-body` for the exact match instead of eyeballing.
- `content-type` is `text/html`, not `text/plain`, because the controller returns a bare string. A change to `text/plain` is a behavior change.
- `POST /` is 404, not 405. Nest reports unmatched method and path through the same not-found path today.
- `HEAD /` is the exception to "all other methods 404": Express handles it through the registered GET route and suppresses the body.
- The 404 body is the contract envelope, not Nest's default JSON. Assert the status and the `RESOURCE_NOT_FOUND` code, not the whole string, because `requestId` is dynamic.
- `main.ts` defaults to port 3000, but a verification run sets `PORT=3311`. A hard-coded 3000 can hit a different process, including someone's dev server.
- `X-Powered-By: Express` is present today. It is not part of the contract and must not be asserted on.
- A 200 from `/` alone does not prove the body. The healthcheck only checks `response.ok`; the journey checks the bytes.
- The harness launches with `NODE_ENV=production` to match the shipping image, so `DATABASE_URL` and the `S3_*` group must be exported first. See the baseline in `README.md`.
