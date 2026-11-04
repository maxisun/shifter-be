# AGENTS.md

NestJS 12 HTTP API (`shifters-be`) on the Express platform: TypeScript 6, native ESM, pnpm 12, Biome, Vitest. Node version comes from `.nvmrc`.

## Commands

| Task | Command |
| --- | --- |
| Install (matches `.nvmrc`) | `nvm install && pnpm install` |
| Dev server, hot reload | `pnpm run start:dev` |
| Dev server + inspector | `pnpm run start:debug` (attach on `:9229`) |
| Build | `pnpm run build` |
| Run built app | `pnpm run start:prod` |
| Unit tests | `pnpm run test` |
| E2E tests | `pnpm run test:e2e` |
| Coverage | `pnpm run test:cov` |
| Lint + format + import order | `pnpm run check` (fixes: `pnpm run check --write`) |
| Contract provenance | `pnpm run contract:verify` |
| Regenerate contract types | `pnpm run contract:generate` |
| Fail on generated-type drift | `pnpm run contract:check` |
| Apply migrations (build first) | `pnpm run db:migrate:build` |
| Apply migrations to built `dist/` | `pnpm run db:migrate` |
| Storage smoke against R2/MinIO | `pnpm run storage:smoke:r2` |
| Containers (app + PostgreSQL + MinIO) | `docker compose up --build` |

Use `pnpm` only: `pnpm add`, `pnpm dlx`. The lockfile is `pnpm-lock.yaml` and installs are frozen in Docker builds.

## ESM rules

The package is `"type": "module"`, compiled with `module: nodenext`. Every relative import needs its `.js` extension, even from a `.ts` file:

```ts
import { AppService } from './app.service.js';
```

`pnpm exec nest g ...` already emits them — keep that style when writing files by hand; a missing extension fails `nest build` with a "Relative import paths need explicit file extensions" error. `import.meta.url` replaces `__dirname`. Top-level `await` is available and used in `src/main.ts`.

## Modules and dependency injection

Feature code lives in `src/<feature>/`: `<feature>.module.ts`, controller, service, `dto/`, `entities/`, colocated specs. Wire new modules into `imports` of `AppModule` (`src/app.module.ts`) — a module that is not imported there never loads.

Nest DI pattern — `@Injectable()` service, module `providers`/`exports`, consumer constructor injection, and a `Test.createTestingModule` wiring test: [`docs/nest-di.md`](docs/nest-di.md). Adapters are plain classes selected by a module factory; only the service is injectable.

Cross-cutting infrastructure is already wired and should be reused rather than re-created:

- `AppConfigModule` (`src/config/`) loads `.env.local` then `.env` in local development, validates with Zod, and provides the `APP_CONFIG` token. Production and tests ignore env files; production startup also calls `assertRuntimeConfig`.
- `AppLoggingModule` provides the pino `PINO_LOGGER` and Nest's `AppLogger`. Use `RequestContextService` to read the request id or the authenticated user; never log request bodies, query strings, tokens, license numbers, TB outcomes, document bytes, or signed URLs.
- `AllExceptionsFilter` (`src/common/errors/`) renders every API failure through the contract's `Error` envelope. Do not add a second API error shape; health probes intentionally return `{ status, checks, requestId }` so orchestrators can read them without parsing an error.
- `configureApp` mounts feature controllers under `/api/v1` (the contract's `servers` URL) and excludes `/` and `/health/*`. `installNotFoundHandler` runs after `app.init()` so unmatched paths outside the prefix still reach the same filter.
- `DatabaseService` exposes typed Kysely (`database-schema.ts`) and a real `ping()` used by readiness.
- `StorageService` is the public storage interface: inject it. It owns key, content-type, length, cache, and TTL policy. `ObjectStorage` is an internal port in `src/storage/object-storage.ts`; S3/R2 and in-memory adapters live under `src/storage/adapters/`. `StorageModule` exports only `StorageService`, and Biome rejects `@aws-sdk/*` or adapter imports outside `src/storage/**`.
- `EMAIL_SENDER` and `ANALYTICS_CLIENT` are global injection tokens. Email and analytics are safe no-ops when unconfigured.
- `src/generated/api/schema.d.ts` is generated from the pinned contract. Never edit it by hand; change the contract and adopt a new release instead.

```bash
pnpm exec nest g resource orders   # module + controller + service + dto + entity
pnpm exec nest g module orders     # just the module
```

Biome disables `useImportType` for `src/**` on purpose: Nest reads constructor parameter metadata at runtime, so injectables and DTOs are imported as values. Reach for `import type` only for types that never appear in a decorated signature (e.g. inside `test/**`).

## Testing

Vitest, not Jest — use `vi.fn()`, `vi.spyOn()`, and `vi.mock()`. `globals: true`, so `describe`, `it`, `expect` need no import.

- Unit specs sit next to their subject as `src/**/*.spec.ts`. Build dependency-injected targets with `Test.createTestingModule({ ... }).compile()`; pure functions and adapters with no DI may be constructed directly.
- E2E specs live in `test/*.e2e-spec.ts`, boot `AppModule` with `createTestApp()` (`test/support/test-app.ts`), which applies the shipped middleware/validation/filter stack, drive it through `supertest`, and `await app.close()` in `afterEach`.
- The e2e setup file (`test/setup-e2e.ts`) removes database/storage/email/analytics environment values, so e2e never touches real dependencies. Override `DatabaseService` when a test needs readiness to report up.
- Each glob runs under its own config (`vitest.config.ts`, `vitest.config.e2e.ts`), so `pnpm run test` never covers `*.e2e-spec.ts` files and `pnpm run test:e2e` never covers `*.spec.ts` ones. Name a file for the run that should execute it.
- `tsconfig.build.json` excludes specs and `test/`, so test-only imports never reach `dist/`.

`strict` is on, but `strictPropertyInitialization` is off: DTO and entity fields need no `!` or initializer.

## Configuration

Configuration comes only from the environment. `@nestjs/config` loads `.env.local` then `.env` for local development, with existing shell variables winning. `src/config/config.ts` is the single schema; grouped integrations are all-or-nothing, and `assertRuntimeConfig` requires `DATABASE_URL` plus the `S3_*` group when `NODE_ENV=production`.

`src/main.ts` is the only bootstrap. It listens on `PORT` (default `3000`). Production sets variables in the environment; `node dist/main.js` reads no `.env` on its own. `.env.example` documents every variable with local-only values and is the only env file that may be committed.

Migrations are compiled with the app. Compose runs them in a one-shot service before the app starts; a deployment should run `node dist/database/migrate.js` as a release step.

## Build and containers

`nest build` deletes and rewrites `dist/` (`deleteOutDir: true`) — treat `dist/` as generated output, never edit it. `dist/main.js` is the entrypoint.

`Dockerfile` is multi-stage: `development` (compose target, bind-mounts the repo), `build`, `production-dependencies`, and `production` (`node` user, `node dist/main.js`). The production `HEALTHCHECK` requests `/` and expects 2xx — keep a successful route there or update the healthcheck with it. Readiness (`/health/ready`) is separate and reports PostgreSQL connectivity with a 200/503. Run the built image with `docker build -t shifters-be:production . && docker run --rm -p 3000:3000 shifters-be:production`, passing `DATABASE_URL` and the `S3_*` group.

`compose.yaml` runs PostgreSQL, MinIO, a bucket creator, the migration job, and the app. MinIO is local-only and uses the same `S3Client` path as R2; never reuse its credentials.

## Git workflow

Use a task branch or isolated worktree for every change; keep `main` as the integration branch.

- Before editing, run `git status --short --branch`.
- If checked out on `main`, create a task branch or worktree before editing. Preserve existing commits and working-tree changes; ask before moving or discarding pre-existing work.
- Commit and push only from the task branch. Verify the current branch before each commit or push.

## Before you commit

Run all of these and fix failures until green:

```bash
pnpm run contract:verify && pnpm run contract:check
pnpm run check && pnpm run build && pnpm run test && pnpm run test:e2e
```

CI (`.github/workflows/ci.yml`) runs the contract gate, lint, build, unit coverage (80% thresholds in `vitest.config.ts`), e2e, and a PostgreSQL job that applies migrations twice to a clean database. Add a spec for every new service or controller; the suite is meant to grow with the code.

Generated contract types are excluded from Biome and from coverage. Operational CLIs (`src/database/migrate.ts`, `src/storage/storage-smoke-cli.ts`) and migrations are excluded from unit coverage and are proven against real PostgreSQL/R2 or MinIO instead.

## Finding code

This repo is indexed by CodeGraph (`.codegraph/`). Ask `codegraph explore "<symbol or question>"` — or the `codegraph_explore` MCP tool — before grepping, reads, or guessing at structure. It returns the live source plus the call paths between symbols.

## Agent skills

### Issue tracker

Issues and specs for this repo live as local Markdown in `../shifters-specs/.scratch/`, consumed at the `tickets-mvp-vX.Y.Z` tag rather than a moving branch. The API contract is pinned separately: follow `../shifters-specs/docs/guides/contract-consumption.md`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
