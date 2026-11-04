---
description: Environment configuration and startup requirements
applyTo: "**/*"
---

## Configuration

Configuration comes only from the environment. `@nestjs/config` loads `.env.local` then `.env` for local development, with existing shell variables winning. `src/config/config.ts` is the single schema; grouped integrations are all-or-nothing, and `assertRuntimeConfig` requires `DATABASE_URL` plus the `S3_*` group when `NODE_ENV=production`.

`src/main.ts` is the only bootstrap. It listens on `PORT` (default `3000`). Production sets variables in the environment; `node dist/main.js` reads no `.env` on its own. `.env.example` documents every variable with local-only values and is the only env file that may be committed.

Migrations are compiled with the app. Compose runs them in a one-shot service before the app starts; a deployment should run `node dist/database/migrate.js` as a release step.
