# Contract pins

This directory records the work specification this repository is built from.
The API contract is pinned separately as the exact release-asset dependency in
`package.json`; `pnpm-lock.yaml` records its `integrity`, and the installed
package's `manifest.json` records the source commit.

| Pin | Where it lives |
| --- | --- |
| API contract `api-v1.0.0` | `package.json` + `pnpm-lock.yaml` + installed `manifest.json` |
| Work specification `tickets-mvp-v1.0.1` | `work-spec.lock.json` |

Both are adopted by reviewed pull requests, never by a background job.
See `../shifters-specs/docs/guides/contract-consumption.md`.
