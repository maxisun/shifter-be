---
description: Branch, commit, and push workflow
applyTo: "**/*"
---

## Git workflow

Use a task branch or isolated worktree for every change; keep `main` as the integration branch.

- Before editing, run `git status --short --branch`.
- If checked out on `main`, create a task branch or worktree before editing. Preserve existing commits and working-tree changes; ask before moving or discarding pre-existing work.
- Commit and push only from the task branch. Verify the current branch before each commit or push.
