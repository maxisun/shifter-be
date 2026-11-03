# shifters-be verification map

This directory is the maintained source for verifying the user-facing behavior of the shifters-be API. Read this index before driving the app, then use the matching feature file as the recipe.

The surface is HTTP: a user is a client with a base URL. The repo exposes `GET /`; Express also answers `HEAD /` through that GET route. Unmatched requests such as `GET /nope` and `POST /` receive Nest's default 404. The production artifact is a multi-stage Docker image. The walking-skeleton ticket (repo-root-relative path: `../shifters-specs/.scratch/shiftpatch-mvp/issues/02-backend-walking-skeleton.md`) adds PostgreSQL and a readiness check, contract-generated types, request IDs, the error envelope, and storage, email, and analytics adapters; the MVP tickets behind it add auth, shifts, claims, credentials, timesheets, and exports. Add a feature file for each capability as it lands, and keep the journeys honest about what exists.

## Baseline preconditions

- Node from `.nvmrc` (26.13): `source ~/.nvm/nvm.sh && nvm use`.
- Dependencies installed: `pnpm install` when `node_modules` is missing or the lockfile changed.
- A launched instance whose `doctor` reports `Doctor: drivable`.
- No other process on the verification port. `launch` refuses a busy port.
- Never drive an instance this run did not start, and never assume port 3000. A dev server, a compose service, or another agent may own it.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Treat every command as literal. Keep quoted bodies and flags unchanged.
- Address the instance by the URL `doctor` prints.
- Assert on route, method, status, `content-type`, `content-length`, and body. `date`, `etag`, `keep-alive`, and `x-powered-by` are incidental and must not appear in an assertion.
- Save one artifact per user action under a name that names the action, not the outcome.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final body.
- HTTP proof is the `.http.txt` artifact produced in the same run as the claim.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.
- Unit and e2e tests support a claim; they never replace the artifact.
- When a journey fails because a precondition is missing (Docker context down, no database), say which precondition and which command failed. Never weaken the assertion to make the journey pass.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with <harness>` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Root endpoint](./root-endpoint.md) covers `GET /` and `HEAD /`, the body and content type, and the 404 for unmatched requests such as `GET /nope` and `POST /`.
- [Production container](./production-container.md) covers building the image, running it, and its self-reported healthcheck.
