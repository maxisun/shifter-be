---
description: Build output, Docker images, and compose services
applyTo: "**/*"
---

## Build and containers

`nest build` deletes and rewrites `dist/` (`deleteOutDir: true`) — treat `dist/` as generated output, never edit it. `dist/main.js` is the entrypoint.

`Dockerfile` is multi-stage: `development` (compose target, bind-mounts the repo), `build`, `production-dependencies`, and `production` (`node` user, `node dist/main.js`). The production `HEALTHCHECK` requests `/` and expects 2xx — keep a successful route there or update the healthcheck with it. Readiness (`/health/ready`) is separate and reports PostgreSQL connectivity with a 200/503. Run the built image with `docker build -t shifters-be:production . && docker run --rm -p 3000:3000 shifters-be:production`, passing `DATABASE_URL` and the `S3_*` group.

`compose.yaml` runs PostgreSQL, MinIO, a bucket creator, the migration job, and the app. MinIO is local-only and uses the same `S3Client` path as R2; never reuse its credentials.
