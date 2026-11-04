---
description: Checks that must pass before committing
applyTo: "**/*"
---

## Before you commit

Run all of these and fix failures until green:

```bash
pnpm run contract:verify && pnpm run contract:check
pnpm run check && pnpm run build && pnpm run test && pnpm run test:e2e
```

CI (`.github/workflows/ci.yml`) runs the contract gate, lint, build, unit coverage (80% thresholds in `vitest.config.ts`), e2e, and a PostgreSQL job that applies migrations twice to a clean database. Add a unit spec for every new service or helper; the suite is meant to grow with the code.

Generated contract types are excluded from Biome and from coverage. Operational CLIs (`src/database/migrate.ts`, `src/storage/storage-smoke-cli.ts`) and migrations are excluded from unit coverage and are proven against real PostgreSQL/R2 or MinIO instead.
