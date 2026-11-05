---
description: Database migration naming and ordering
applyTo: "**/*"
---

## Database migrations

Migrations live in `src/database/migrations/`, export `up` and `down`, and are registered in `src/database/migrations/index.ts`. Kysely runs them in alpha-numeric order of their registered keys, so the key is the ordering contract.

- Name new files `<YYYYMMDDHHmmss>-<kebab-case-description>.ts` in UTC, for example `20261104153000-create-users.ts`. Kysely recommends an ISO 8601 timestamp prefix; this compact form stays filesystem-safe and sortable.
- Register the file's stem with hyphens replaced by underscores: `'20261104153000_create_users'`.
- Never rename an applied migration or add one that sorts before an applied migration; add a new migration instead.
- `0001-system-metadata.ts` is the existing baseline and keeps its current name.
