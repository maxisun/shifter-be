# CI pipeline research

## Context

`shifters-be` is a private NestJS 12 API (TypeScript 6, native ESM, pnpm 12, Vitest 4) with **no `.github/` directory and no CI**. This document answers what a first GitHub Actions workflow needs.

**Decision for the first pipeline:** it runs **unit tests only**, and fails when coverage drops below **80%**. Lint, build and e2e stay in the local pre-commit gate for now. The workflow lives in `.github/workflows/ci.yml`; the coverage thresholds live in `vitest.config.ts`, so `pnpm run test:cov` behaves the same locally and in CI.

Repo facts that drive the design:

| Fact | Value |
| --- | --- |
| Package manager | `"packageManager": "pnpm@12.14.0"` in `package.json` (published: yes, npm registry `12.14.0`; `engines.node: ">=18.*"`) |
| Node version source | `.nvmrc` contains `26.13` (no `v` prefix, no patch) |
| Local gate (per `AGENTS.md`) | `pnpm run check && pnpm run build && pnpm run test && pnpm run test:e2e` |
| CI scope (v1) | `pnpm run test:cov` — unit tests plus the 80% coverage gate |
| Unit tests | `vitest run` — `include: ['**/*.spec.ts']` |
| Coverage | `vitest run --coverage` — thresholds in `vitest.config.ts` |
| E2E tests | `vitest run --config ./vitest.config.e2e.ts` — `include: ['**/*.e2e-spec.ts']` |
| E2E boot | `Test.createTestingModule(...).compile()` + `app.init()`, driven by `supertest` |

Note: `**/*.spec.ts` does not match `app.e2e-spec.ts` (verified with picomatch), so the two globs do not overlap and both steps are needed.

## 1. GitHub Actions basics for a Node project

**Current majors (as of Nov 2026):** `actions/checkout@v7` ([release v7.0.1](https://github.com/actions/checkout/releases)), `actions/setup-node@v7` ([release v7.1.0](https://github.com/actions/setup-node/releases)), `pnpm/action-setup@v6` ([release v6.1.0](https://github.com/pnpm/action-setup/releases)).

**They do not run on your project's Node.** All three are JavaScript actions whose `action.yml` declares `runs.using: node24` ([checkout](https://github.com/actions/checkout/blob/main/action.yml), [setup-node](https://github.com/actions/setup-node/blob/main/action.yml), [pnpm/action-setup](https://github.com/pnpm/action-setup/blob/master/action.yml)). The runner ships that Node 24 runtime itself; you do not pin it, and `setup-node` only changes the `node` on `PATH` for later `run:` steps. `setup-node` v5 moved to node24 already, and v7 is an ESM-internals release with no input changes ([README](https://github.com/actions/setup-node#whats-new-in-v7)).

**`pnpm/action-setup` can omit `version:`.** The input is optional when `package.json` declares `packageManager` or `devEngines.packageManager` ([README, "Install only pnpm with packageManager"](https://github.com/pnpm/action-setup#install-only-pnpm-with-packagemanager)). This repo declares `pnpm@12.14.0`, so `version:` is redundant. v6 supports pnpm v12 and earlier ([README note](https://github.com/pnpm/action-setup#setup-pnpm)).
Because the action reads `package.json`, `actions/checkout` must run **before** it.

**`pnpm/action-setup` must run before `setup-node` when using `cache: 'pnpm'`.** The `cache` input says "Package manager should be pre-installed" ([setup-node README, inputs](https://github.com/actions/setup-node#usage)), and the cache implementation shells out to `pnpm store path --silent` to find the store directory ([`src/cache-utils.ts`](https://github.com/actions/setup-node/blob/main/src/cache-utils.ts)). Without pnpm on `PATH` that call fails. The documented pnpm recipe is exactly `checkout → pnpm/action-setup → setup-node (cache: pnpm) → pnpm install` ([advanced-usage.md, "Caching pnpm dependencies"](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#caching-packages-data)).

**`--frozen-lockfile` is now automatic in CI, but still correct to pass.** pnpm's CI docs: "When pnpm detects that it is running in CI, it switches to frozen-lockfile mode automatically", and it also errors on a lockfile written by a newer pnpm major ([pnpm.io/continuous-integration](https://pnpm.io/continuous-integration)). `setup-node`'s docs still recommend it explicitly for pnpm in CI ([advanced-usage.md, lockfiles](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#working-with-lockfiles)). Passing it is harmless and makes intent explicit.

## 2. Node version sourcing (`.nvmrc` = `26.13`)

**`node-version-file: .nvmrc` accepts a plain version.** Supported syntax includes "More specific versions: `20.19`, `22.17.1`, `24.8.0`" — i.e. partial versions without a `v` ([setup-node README, supported version syntax](https://github.com/actions/setup-node#supported-version-syntax)). Internally the file is parsed with `contents.match(/^(?:node(js)?\s+)?v?(?<version>[^\s]+)$/m)`, so `26.13` is passed through as the spec ([`src/util.ts`](https://github.com/actions/setup-node/blob/main/src/util.ts)). The path is resolved against `GITHUB_WORKSPACE`, so checkout must come first ([advanced-usage.md, "Node version file"](https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#node-version-file)).

**Node 26 is real and is the current LTS.** Node 26 ("Lithium") was first released May 05, 2026 and is listed **LTS**, latest `v26.13.0` (Oct 28, 2026); Node 27 is only Alpha ([nodejs.org release table](https://nodejs.org/en/about/previous-releases)). The toolchain supports it: Vite 8.3.5 declares `engines.node: ^20.19.0 || >=22.12.0` and Vitest 4.1.12 declares `^20.0.0 || ^22.0.0 || >=24.0.0` (installed `package.json`s).

**Runner images do not pre-cache Node 26.** The Ubuntu 24.04 image lists cached Node.js `22.23.4` and `24.22.1` only ([Ubuntu2404-Readme.md](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md#cached-tools)); Ubuntu 26.04 lists the same two ([Ubuntu2604-Readme.md](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Readme.md)). That is not a blocker: `setup-node` resolves versions from the `actions/node-versions` manifest, which **does contain `26.13.0` for `linux-x64`** ([versions-manifest.json](https://github.com/actions/node-versions/blob/main/versions-manifest.json)), and falls back to `nodejs.org/dist` on a miss ([README](https://github.com/actions/setup-node#usage)). Expect a one-time download per run (tool-cache miss), not a compile.

**`ubuntu-latest` is mid-migration.** The label moves from Ubuntu 24.04 to 26.04 over the weeks starting Oct 19, 2026, completing by Nov 19, 2026 ([runner-images#14748](https://github.com/actions/runner-images/issues/14748)). Nothing in this repo compiles native code, so the main exposure is prebuilt binaries/packages, not this stack.

## 3. Vitest 4 in CI

**`vitest run` never watches.** "Perform a single run without watch mode" ([v4 CLI docs](https://v4.vitest.dev/guide/cli#vitest-run)). Watch mode is only the default for bare `vitest`, and that already "falls back to `vitest run` in CI or when stdin is not a TTY" ([v4 CLI docs](https://v4.vitest.dev/guide/cli)). No `--run`, `--watch=false`, or `--no-watch` flag is needed — the repo's scripts already use `vitest run`.

**No special reporter flag is needed.** The `github-actions` reporter "is automatically enabled when the `reporters` option is not configured and `process.env.GITHUB_ACTIONS === 'true'`", and it adds failure annotations plus a job summary ([v4 reporters docs](https://v4.vitest.dev/guide/reporters#github-actions-reporter)). Neither `vitest.config.ts` nor `vitest.config.e2e.ts` sets `reporters`, so this applies as-is. Adding `--reporter=github-actions` would only be needed if reporters were configured.

**CI detection is automatic.** GitHub Actions sets `CI` to `"true"` in every step ([default environment variables](https://docs.github.com/en/actions/reference/workflows-and-actions/variables#default-environment-variables)). Vitest uses `process.env.CI` for `browser.headless`, `browser.ui`, and `allowOnly` defaults ([v4 CLI docs](https://v4.vitest.dev/guide/cli)) — irrelevant here (node environment, no browser mode, no `.only`), but it confirms no env plumbing is required.

**Coverage needs nothing extra.** `@vitest/coverage-v8@^4.1.2` is already a devDependency, and v8 is the default provider ([v4 coverage docs](https://v4.vitest.dev/guide/coverage#coverage-providers)); `pnpm run test:cov` is `vitest run --coverage`.

### Coverage gate (80%)

- **`coverage.include` is mandatory in Vitest 4.** `coverage.all` was removed and coverage now reports **only files loaded by the tests** unless `include` is set ([v4 migration guide, removed options](https://github.com/vitest-dev/vitest/blob/v4.1.2/docs/guide/migration.md)). Without it, an untested service simply does not appear in the report and cannot fail the threshold. `vitest.config.ts` therefore sets `include: ['src/**/*.ts']` and excludes `src/main.ts` (starts an HTTP listener on import), `src/**/*.module.ts` (declarative wiring) and specs.
- **Thresholds fail the run.** `test.coverage.thresholds` accepts percentages per metric; a miss exits `1` with `ERROR: Coverage for lines (x%) does not meet global threshold (80%)` ([coverage config](https://github.com/vitest-dev/vitest/blob/v4.1.2/docs/config/coverage.md)). Keeping thresholds in the config rather than in the workflow means `pnpm run test:cov` fails identically on a laptop.
- **Metrics gated:** `lines`, `statements`, `functions`. **`branches` is deliberately not gated yet:** the only branch Vitest reports today is a `cond-expr` generated by decorator transpilation at `app.controller.ts:4` (1 of 2 branch paths taken, 50%), not source logic, so an 80% branch gate would fail on every run for a reason no test can fix. Add `branches: 80` once real branching code exists.
- **Reporters:** `text` only. The job log carries the coverage table and the threshold error; no artifact or codecov upload is part of v1.

## 4. Gotchas for this stack

**E2E does not need a `PORT`.** The spec calls `app.init()` (no `listen()`), then `supertest(app.getHttpServer())`. Supertest's `serverAddress()` detects a non-listening server and calls `app.listen(0, '127.0.0.1')`, i.e. an ephemeral loopback port, then closes it after the request ([`lib/test.js`](https://github.com/ladjs/supertest/blob/master/lib/test.js)). `src/main.ts` (the only place reading `process.env.PORT`) is never imported by the tests.

**ESM is already handled.** `"type": "module"` + relative imports with `.js` extensions are compiled by Vitest/Vite, not by Node's resolver, so no loader flags are needed. `tsconfigPaths: true` in both configs requires Vite 8, which is installed ([vite 8.3.5](https://www.npmjs.com/package/vite)).

**Lint and build stay local-only in v1.** `biome check ./src ./test` reports lint and formatting problems and exits non-zero, and `nest build` is what catches ESM import-extension mistakes. Both still matter, but the first workflow intentionally runs neither — add them as steps before `test:cov` once the pipeline is proven, or a lint-only push can land on `main` unchecked.

**Type/runtime version skew (minor).** `@types/node` is `^24.0.0` while `.nvmrc` pins Node 26. Type-level only; note it if Node-26-only APIs are used later.

## 5. GitHub Actions specifics

- **Permissions:** set `permissions: contents: read` at workflow level. Both `checkout` and `setup-node` document this as the recommended minimum ([checkout README](https://github.com/actions/checkout#recommended-permissions), [setup-node README](https://github.com/actions/setup-node#recommended-permissions)). Once you list any permission, all unlisted ones become `none` ([workflow syntax, permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions)), so this is a strict allowlist.
- **Concurrency:** `concurrency` allows one running job/workflow per group, and `cancel-in-progress: true` cancels the in-flight run when a new one is queued ([workflow syntax, concurrency](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#concurrency)). Group names are case-insensitive. `${{ github.workflow }}-${{ github.ref }}` resolves to the PR's merge ref, so a new push cancels that PR's earlier run without touching other PRs.
- **Triggers:** the workflow runs on `pull_request` with explicit activity types — `opened`, `synchronize` (new commits pushed to the PR), `reopened`, and `ready_for_review` — so the only way code reaches `main` is through a PR whose checks ran ([workflow syntax, `on`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#on)). There is deliberately no `push` trigger, so merges to `main` do not re-run the suite. A brand-new workflow file only takes effect on `push` once it is on that branch; PR runs use the workflow from the PR's merge commit, so the first PR validates it.
- **Private repo:** nothing extra to configure for same-repository PRs; usage simply draws from the plan's included compute allowance, and cache storage is a separate 10 GB per-repository allowance ([GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)).
- **`timeout-minutes`:** job default is 360 minutes ([workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idtimeout-minutes)); step max is 360. Set a job-level value so a hung test cannot burn an hour of quota — this suite finishes in well under 5 minutes.

## Workflow (v1: unit tests + coverage)

The workflow is `.github/workflows/ci.yml` (the single source of truth — don't copy it here, it drifts). It runs one job on every PR event, with these steps:

1. `actions/checkout@v7`
2. `pnpm/action-setup@v6` — no `version:` input; it reads `packageManager` from `package.json`.
3. `actions/setup-node@v7` — `node-version-file: .nvmrc`, `cache: pnpm`.
4. `pnpm install --frozen-lockfile`
5. `pnpm run test:cov` — the unit suite plus the 80% coverage gate.

No `CI=true` or reporter flags are needed: GitHub sets `CI`, and Vitest auto-enables its `github-actions` reporter when `reporters` is unset (see above). The coverage gate is not a workflow flag — it is the `thresholds` block in `vitest.config.ts`, so the same command enforces it locally.

## Assumptions and risks

- **Node 26 is downloaded, not pre-cached.** Runner images only cache 22 and 24 ([Ubuntu 24.04](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md), [Ubuntu 26.04](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2604-Readme.md)); `26.13.0` exists in [actions/node-versions](https://github.com/actions/node-versions/blob/main/versions-manifest.json), so setup-node fetches it each run (adds ~10–20 s, no compile). If that release is ever missing, setup-node falls back to `nodejs.org/dist`.
- **`.nvmrc` is a range, not a pin.** `26.13` resolves to the latest `26.13.x`; CI can drift within that patch line. Pin `26.13.0` in `.nvmrc` if reproducibility matters more than patch updates.
- **pnpm 12 on `action-setup`.** v6 explicitly supports pnpm v12 and earlier, and `12.14.0` is published — but this is the newest supported combination, so it is worth watching the first run. If it ever breaks, the fallback is `pnpm/setup@v3` with `runtime: node@26` ([pnpm CI docs](https://pnpm.io/continuous-integration#github-actions)).
- **`ubuntu-latest` is changing under you.** Ubuntu 26.04 becomes `ubuntu-latest` by Nov 19, 2026 ([runner-images#14748](https://github.com/actions/runner-images/issues/14748)). Pin `runs-on: ubuntu-24.04` if OS drift becomes a concern.
- **Frozen lockfile is a hard gate.** A `package.json` change without a regenerated `pnpm-lock.yaml` fails at install (intended; pnpm also refuses lockfiles written by a newer major).
- **Local vs CI Node may differ.** This machine was running Node `v24.18.0` while `.nvmrc` says `26.13`; e2e behaviour should be identical here, but keep them aligned to avoid surprises.
- **Not covered yet:** `check`, `build` and e2e as CI steps, coverage artifacts/uploads, sharding, and status checks/branch protection (branch protection is a repo setting, not workflow YAML). Because only `test:cov` runs, a push can still break lint, the build, or e2e while CI stays green — keep running the local gate from `AGENTS.md` until those steps are added.
