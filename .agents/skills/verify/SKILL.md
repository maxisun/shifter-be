---
name: verify
description: Launch the shifters-be NestJS API locally and prove an HTTP feature end to end with real requests and saved evidence. Use when asked to verify, prove, or check behavior against the running app, or after a change that must be shown working.
---

# Verify shifters-be

The surface is HTTP. A user is a client with a base URL; there is no browser and no CLI. Today the app exposes `GET /`; Express also answers `HEAD /` through that route, while unmatched requests such as `GET /nope` and `POST /` receive Nest's default 404. Drive it with real requests against a process this run started, and keep the exchange as evidence.

All commands below run from the repo root.

## Launch

```bash
source ~/.nvm/nvm.sh && nvm use        # .nvmrc pins 26.13
pnpm install                           # only when node_modules is missing or pnpm-lock.yaml changed
.agents/skills/verify/scripts/control.mjs launch
```

`launch` runs `pnpm run build`, starts `node dist/main.js` detached with `PORT=3311`, sends its output to `.verify/runs/<run-id>/app.log`, and polls `GET /` until it answers. It exits non-zero with the log tail if the process dies or nothing answers within 20 seconds. Ready means the app answers HTTP, not merely that a PID exists.

Teardown is `control.mjs stop` (see Cleanup).

Do not verify with `pnpm run start:dev`. Watch mode rebuilds mid-run and proves the TypeScript sources, while Docker ships `node dist/main.js`. Verify the artifact that ships.

The harness manages one local app instance at a time. `launch` refuses to start while its recorded process is alive, even if you pass another port. Stop it before launching another local instance. The production-container journey uses Docker separately on port 3312; its health must be checked with Docker, not this local-instance doctor.

## Doctor

```bash
.agents/skills/verify/scripts/control.mjs doctor
```

Read-only, exits `1` on any FAIL. It checks that the recorded PID is alive and its command line is `dist/main.js`, that the port belongs to that PID, that `dist/main.js` is newer than every `src/**/*.ts`, that the launched Node matches `.nvmrc`, and that `/` answers at all. It does not judge feature correctness — a 500 from `/` is still a drivable instance and the journey's job to report.

Run it before every journey, and again whenever a result looks wrong.

## Drive

```bash
.agents/skills/verify/scripts/control.mjs get / --save root --expect-status 200 --expect-body 'Hello World!'
```

`get` sends a real request to the launched port, prints the full exchange, and writes it to `.verify/runs/<run-id>/artifacts/root.http.txt`. It exits `1` when an expectation fails and still writes the artifact.

- `--expect-status N` — exact status.
- `--expect-body TEXT` — exact body. Use it when byte-level equality matters.
- `--expect-body-contains TEXT` — substring, for JSON envelopes with a dynamic path.
- `--method GET` — any method.
- `--base http://host:port` — target something other than the launched run (the production container). Without it, `get` uses the launched port.
- `--save NAME` — artifact name. Without it the exchange is printed only.

Stable handles are route paths, methods, status codes, `content-type`, and exact bodies. Never assert on `date`, `etag`, or `x-powered-by`; they are incidental.

## Evidence

Everything for a run lives in `.verify/runs/<run-id>/`:

| File | Contents |
| --- | --- |
| `run.json` | run id, port, PID, Node version, timestamps, status |
| `app.log` | Nest startup log for the launched process |
| `build.log` | `pnpm run build` output |
| `artifacts/` | feature-specific evidence: HTTP exchanges (`<name>.http.txt`) and, for the container journey, the build log, health/user values, container id, and startup line |

Proof standards:

- Exercise the real route over TCP on the launched port. Never a service method, a unit test client, or a test-only endpoint.
- Capture the action and the resulting state in one artifact: the request line proves the action, the response proves the state.
- For a mutation, re-read with a second `get` and keep both artifacts. No route mutates anything yet.
- Unit and e2e tests support a claim; they never replace the artifact. `pnpm run test` and `pnpm run test:e2e` boot the app in-process and never bind a port.
- Every claim names the run id, port, and route that produced it.

## Cleanup

```bash
.agents/skills/verify/scripts/control.mjs stop
```

`stop` sends `SIGTERM` to the PID in `run.json`, waits up to 5 seconds, then `SIGKILL`, but only after confirming that PID's command line contains `dist/main.js`. If it does not, it refuses rather than killing a stranger. Never use `pkill`, `killall`, or `lsof | xargs kill`.

`stop` never deletes evidence. Artifacts survive teardown; after stopping, confirm they are still under `.verify/runs/<run-id>/artifacts/`. Delete `.verify/` only when the user asks to discard proof.

## Helpers

| Command | Purpose |
| --- | --- |
| `.agents/skills/verify/scripts/control.mjs launch [--port N] [--skip-build]` | build, start, wait for readiness |
| `.agents/skills/verify/scripts/control.mjs doctor` | read-only drivability check |
| `.agents/skills/verify/scripts/control.mjs get <path> [flags]` | request plus evidence |
| `.agents/skills/verify/scripts/control.mjs stop` | stop only the PID this run started |
| `.agents/skills/verify/scripts/control.mjs --help` | usage |

The script is dependency-free Node and requires `ps` and `lsof`, both present on macOS.

## Features

Read [`features/README.md`](./features/README.md) before driving anything. It holds the baseline preconditions, the driving conventions, and the proof-reporting rules; each feature file is the recipe for one user-visible capability. Add a feature file when a capability lands.
