# Git Workflow

## Branches

- `main`: stable, reviewed work.
- `feat/BOOT-001-monorepo-skeleton`: one feature/task branch.
- `fix/<short-description>`: focused bug fix.
- `docs/<short-description>`: documentation-only change.

## Every task

1. `git status`
2. `git switch main`
3. `git pull --ff-only` (when using a remote)
4. `git switch -c feat/<BACKLOG-ID>-<short-name>`
5. Implement one task.
6. Run relevant tests/checks.
7. Inspect `git diff` and `git status`.
8. Commit with a message such as `feat(books): ensure monthly books idempotently`.
9. Push branch and open a PR.
10. Merge only after review and required CI checks pass.

Do not commit `.env`, database dumps, real financial data, credentials, or generated local artifacts. Do not force-push or rewrite shared history unless explicitly approved.

## Suggested commit prefixes

- `feat:` new behavior
- `fix:` bug fix
- `docs:` documentation
- `test:` tests only
- `refactor:` internal restructuring
- `build:` tooling/dependencies
- `ci:` automation

## Agent switching

Before changing agents, require the current agent to:
- finish or clearly mark the current task partial,
- report branch and commit,
- update the backlog and handoff checkpoint,
- list changed files and test results,
- state the exact next action.

The next agent must inspect Git status and the checkpoint before editing.
