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
| Containers | `docker compose up --build` |

Use `pnpm` only: `pnpm add`, `pnpm dlx`. The lockfile is `pnpm-lock.yaml` and installs are frozen in Docker builds.

## ESM rules

The package is `"type": "module"`, compiled with `module: nodenext`. Every relative import needs its `.js` extension, even from a `.ts` file:

```ts
import { AppService } from './app.service.js';
```

`pnpm exec nest g ...` already emits them — keep that style when writing files by hand; a missing extension fails `nest build` with a "Relative import paths need explicit file extensions" error. `import.meta.url` replaces `__dirname`. Top-level `await` is available and used in `src/main.ts`.

## Modules and dependency injection

Feature code lives in `src/<feature>/`: `<feature>.module.ts`, controller, service, `dto/`, `entities/`, colocated specs. Wire new modules into `imports` of `AppModule` (`src/app.module.ts`) — a module that is not imported there never loads.

```bash
pnpm exec nest g resource orders   # module + controller + service + dto + entity
pnpm exec nest g module orders     # just the module
```

Biome disables `useImportType` for `src/**` on purpose: Nest reads constructor parameter metadata at runtime, so injectables and DTOs are imported as values. Reach for `import type` only for types that never appear in a decorated signature (e.g. inside `test/**`).

## Testing

Vitest, not Jest — use `vi.fn()`, `vi.spyOn()`, and `vi.mock()`. `globals: true`, so `describe`, `it`, `expect` need no import.

- Unit specs sit next to their subject as `src/**/*.spec.ts` and build the target with `Test.createTestingModule({ ... }).compile()`.
- E2E specs live in `test/*.e2e-spec.ts`, boot `AppModule` with `createNestApplication()`, drive it through `supertest`, and `await app.close()` in `afterEach`.
- Each glob runs under its own config (`vitest.config.ts`, `vitest.config.e2e.ts`), so `pnpm run test` never covers `*.e2e-spec.ts` files and `pnpm run test:e2e` never covers `*.spec.ts` ones. Name a file for the run that should execute it.
- `tsconfig.build.json` excludes specs and `test/`, so test-only imports never reach `dist/`.

`strict` is on, but `strictPropertyInitialization` is off: DTO and entity fields need no `!` or initializer.

## Configuration

`PORT` (default `3000`) and `NODE_ENV` are read from the environment. `src/main.ts` is the only bootstrap; it listens with `await app.listen(process.env.PORT ?? 3000)`.

`.env` is git-ignored and **not** loaded by the current `start` scripts. To use one, pass the flag yourself:

```bash
pnpm exec nest start --watch --env-file=.env
```

Production sets variables in the environment; `node dist/main.js` reads nothing from disk.

## Build and containers

`nest build` deletes and rewrites `dist/` (`deleteOutDir: true`) — treat `dist/` as generated output, never edit it. `dist/main.js` is the entrypoint.

`Dockerfile` is multi-stage: `development` (compose target, bind-mounts the repo), `build`, `production-dependencies`, and `production` (`node` user, `node dist/main.js`). The production `HEALTHCHECK` requests `/` and expects 2xx — keep a successful route there or update the healthcheck with it. Run the built image with `docker build -t shifters-be:production . && docker run --rm -p 3000:3000 shifters-be:production`.

## Before you commit

Run all four and fix failures until green:

```bash
pnpm run check && pnpm run build && pnpm run test && pnpm run test:e2e
```

CI (`.github/workflows/ci.yml`) runs `pnpm run test:cov` on pull requests — opened, updated, reopened, or marked ready for review — and fails below the 80% coverage thresholds in `vitest.config.ts`. Lint, build and e2e are **not** in CI yet, so still run all four yourself before pushing. Rationale and sources: `docs/research/ci-pipeline.md`. Add a spec for every new service or controller; the suite starts tiny and is meant to grow with the code.

## Finding code

This repo is indexed by CodeGraph (`.codegraph/`). Ask `codegraph explore "<symbol or question>"` — or the `codegraph_explore` MCP tool — before grepping, reads, or guessing at structure. It returns the live source plus the call paths between symbols.

## Agent skills

### Issue tracker

Issues and specs for this repo live as local Markdown in `../shifters-specs/.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
