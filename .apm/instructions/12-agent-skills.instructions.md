---
description: Repo process docs for issues, triage, and domain context
applyTo: "**/*"
---

## Agent skills

### Issue tracker

Issues and specs for this repo live as local Markdown in `../shifters-specs/.scratch/`, consumed at the `tickets-mvp-vX.Y.Z` tag rather than a moving branch. The API contract is pinned separately: follow `../shifters-specs/docs/guides/contract-consumption.md`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: root `GLOSSARY.md` and `docs/adr/`. See `docs/agents/domain.md`.
