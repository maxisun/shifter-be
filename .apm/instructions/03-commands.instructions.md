---
description: Canonical pnpm, Docker, and database commands
applyTo: "**/*"
---

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
