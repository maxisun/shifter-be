# Deployment and external proof

Status: the service is deployable, but no host has been chosen and no sandbox
credentials are available in this checkout. The local production container is
proven; a real HTTPS URL and a real Cloudflare R2 smoke remain external
blockers.

## What is already proven

- The multi-stage production image builds and runs as the `node` user.
- It serves `GET /` and its own `HEALTHCHECK` reaches `healthy`.
- It joins the compose network, applies migrations with
  `node dist/database/migrate.js`, and returns `checks.database = "up"` from
  `GET /health/ready`.
- The same S3 adapter performs put, presign, a signed fetch, streaming get, and
  delete against local MinIO.

Evidence lives under `.verify/runs/<run-id>/artifacts/`.

## Deploy checklist

1. Choose a container host that provides HTTPS termination and a managed
   PostgreSQL (or a managed PostgreSQL endpoint). Record the vendor here once
   chosen.
2. Push the image produced by the `production` stage, tagged with the commit
   SHA.
3. Set these secrets in the deployment configuration, never in the repository:
   - `DATABASE_URL`
   - `S3_ENDPOINT` (`https://<ACCOUNT_ID>.r2.cloudflarestorage.com`)
   - `S3_REGION=auto`
   - `S3_BUCKET`
   - `S3_ACCESS_KEY_ID`
   - `S3_SECRET_ACCESS_KEY`
   - optional: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`,
     `POSTHOG_API_KEY`, `POSTHOG_HOST`
   - `NODE_ENV=production`, `PORT` as required by the host, and
     `TRUST_PROXY=true` behind the platform proxy.
4. Run `node dist/database/migrate.js` as a release step before the new app
   revision receives traffic. Do not run migrations from every replica.
5. Point the platform health check at `GET /health/ready` (database-aware) and
   its liveness check at `GET /health/live`.
6. Verify the deployed URL over HTTPS:
   ```sh
   curl -i https://<host>/health/live
   curl -i https://<host>/health/ready
   curl -i https://<host>/
   ```
7. Run the R2 smoke against the deployed bucket from a trusted machine:
   ```sh
   S3_ENDPOINT=... S3_REGION=auto S3_BUCKET=... \
   S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
   pnpm run storage:smoke:r2
   ```
   Do not set `S3_PUBLIC_ENDPOINT` for R2.

## Why this is not automated yet

Deployment needs a vendor account, a project/namespace, and a token. The
repository owner has not chosen one, and no token is present in the local
environment. The R2 smoke needs an account-owned token scoped to one private
bucket. Adding a guessed vendor workflow or checked-in credentials would be
worse than leaving the gap explicit.
