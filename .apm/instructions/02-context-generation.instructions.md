---
description: AGENTS.md is generated from APM instruction primitives
applyTo: "**/*"
---

## Context generation (APM)

`AGENTS.md` is compiled output, not a source file. The source of truth is `.apm/instructions/`.

- Edit the relevant `.apm/instructions/*.instructions.md` file, then run `apm compile` from the repo root to regenerate `AGENTS.md`.
- Never edit `AGENTS.md` by hand; the next `apm compile` run overwrites it.
- `apm compile` reads the `targets` list in `apm.yml` (currently `opencode`) and folds every instruction into the root `AGENTS.md`.
- Compiled output is committed; re-run `apm compile` and commit the regenerated `AGENTS.md` whenever an instruction changes.
