# Object storage

The API talks to Cloudflare R2 through a narrow S3-compatible adapter. Local development points the same adapter at MinIO, so the code path is identical; only the endpoint, region, and credentials differ. The smoke command proves put, presign, a GET through the signed URL, a streaming get, delete, and a post-delete read.

## Sub-features

- `storage-put` writes an opaque key with content type, length, disposition, and private cache control.
- `storage-presign` returns a short-lived signed GET URL.
- `storage-fetch` follows the signed URL and receives the exact uploaded bytes.
- `storage-get` streams the object back through the adapter.
- `storage-delete` removes the object, and a second read fails.

## How to get to it (user POV)

- Run the smoke command against the configured bucket.
- In local development the bucket is MinIO's `shiftpatch-local`, created by compose.
- In sandbox/prod the bucket is the private R2 bucket from deployment secrets.

## Driving it with pnpm

Preconditions:

- Compose MinIO is up and the bucket exists (`docker compose up -d minio minio-init`).
- `.env` is exported, or `S3_*` values are set in the shell.
- `S3_PUBLIC_ENDPOINT` differs from `S3_ENDPOINT` only when the browser/CLI must use a different host, as with containerized MinIO.

- **Run the smoke test.** From the repo root:
  ```bash
  RUN_ID=$(cat .verify/current)
  pnpm run storage:smoke:r2 \
    > ".verify/runs/$RUN_ID/artifacts/storage-smoke.json" 2>&1
  cat ".verify/runs/$RUN_ID/artifacts/storage-smoke.json"
  ```
  A pass prints one JSON line with `"ok":true`, `"steps":["put","presign-get","presigned-fetch","get","delete","delete-verified"]`, the bucket, key, byte count, and presigned status 200. The command exits non-zero on the first failed step and prints `{"ok":false,"step":…}` with no credential or signed URL.
- **Inspect the bucket (optional).** Open `http://localhost:9001` with the local MinIO credentials from `.env`; the bucket contains no leftover object because the smoke test deletes it.
- **Real R2.** Export the production `S3_ENDPOINT`, `S3_REGION=auto`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY` (do not set `S3_PUBLIC_ENDPOINT`) and run the same command. The command performs the same steps against R2.
- **Proof.** Keep `storage-smoke.json`. It names the bucket and key and lists every completed step; the key is opaque and no URL is printed.

## Gotchas

- The smoke test uses a real object key under `smoke/<uuid>` and deletes it. If delete fails, the object remains; remove it with the provider console. It never overwrites an existing key.
- `S3_PUBLIC_ENDPOINT` is required only when the presigning process and the consumer see different hosts. In compose the app talks to `http://minio:9000` but the presigned URL must use `http://localhost:9000`; without it, the signed host is unreachable and the fetch fails.
- The adapter caps presigned GETs at 15 minutes even if a caller asks for longer.
- AWS SDK checksum defaults are deliberately set to `WHEN_REQUIRED` for request and response. Do not remove those options; R2's documented checksum matrix does not line up with the SDK's 2025 defaults.
- A local MinIO pass does not prove R2-specific behavior. The ticket requires a separate smoke against a real R2 bucket; if credentials are absent, report it as skipped with this exact command rather than claiming R2 is verified.
