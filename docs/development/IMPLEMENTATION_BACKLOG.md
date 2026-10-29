# Khaata Implementation Backlog

Statuses: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`. Update status only after checking actual repository state.

## Milestone M0 — Repository foundation

### BOOT-001 — Initialize repository and monorepo skeleton
- Status: TODO
- Create `frontend/`, `backend/`, `.github/`, and preserve docs.
- Add `.gitignore`, `.env.example`, README, agent instructions, PR template, issue templates.
- Set default branch and initial commit only after review.
- Acceptance: clean Git status; no secrets committed; docs retained; project layout matches README.

### BOOT-002 — Add CI baseline
- Status: TODO
- Add backend test/lint and frontend lint/typecheck/build workflows as their projects exist.
- Acceptance: workflow runs on pull requests and failures block merge.

## Milestone M1 — Backend foundation

### BE-001 — Django project and settings
- Status: TODO
- Create Django project, split development/test/production settings if useful.
- Configure environment-driven secrets, PostgreSQL, timezone, allowed hosts, CSRF/CORS.
- Declare custom user model before first migration.
- Add health endpoint.
- Acceptance: fresh setup instructions work; secrets absent from repo; health endpoint responds.

### BE-002 — Custom user and authentication
- Status: TODO
- Registration, login, logout, current user, CSRF bootstrap.
- Acceptance: auth tests, password validation, CSRF tests, cross-user isolation.

### BE-003 — Books and monthly ensure
- Status: TODO
- Models, constraints, services, serializers, endpoints and tests.
- Acceptance: monthly uniqueness under repeated/concurrent calls; event/general CRUD; archive rules.

### BE-004 — Categories and payment methods
- Status: TODO
- User-scoped CRUD, registration seeding, case-insensitive uniqueness.
- Acceptance: ownership and type validations covered.

### BE-005 — Transactions
- Status: TODO
- Decimal amounts, validation, soft delete, filters, pagination.
- Acceptance: ownership, category compatibility, date/month behavior, totals exclude deleted records.

### BE-006 — Budgets and allocations
- Status: TODO
- Monthly/event budgets, atomic allocation replacement, derived utilization.
- Acceptance: allocation cap under concurrency; zero-budget and overspending cases tested.

### BE-007 — Reports and CSV export
- Status: TODO
- Combined monthly dashboard, book report, budget utilization, safe CSV.
- Acceptance: event expenses count once in monthly totals; CSV formula injection mitigated.

## Milestone M2 — Frontend foundation

### FE-001 — React/Vite/TypeScript setup
- Status: TODO
- Add routing, linting, formatting, design tokens, responsive app shell.
- Acceptance: build/lint/typecheck work; navigation matches UI/UX spec.

### FE-002 — Auth screens and API client
- Status: TODO
- Typed API client, CSRF/session handling, login/register/logout and route protection.
- Acceptance: no tokens in local storage; errors and loading states are accessible.

### FE-003 — Books screens
- Status: TODO
- Monthly/event/general lists and event/general create/edit/archive.
- Acceptance: month navigation and empty/error states work.

### FE-004 — Quick transaction entry and history
- Status: TODO
- Add/edit form, filters, pagination, transaction details.
- Acceptance: mobile form usable at 320px width; failed save preserves values.

### FE-005 — Dashboard and budget planner
- Status: TODO
- Combined monthly totals, book-type breakdown, category charts, budget progress.
- Acceptance: display matches API totals; warnings are understandable.

### FE-006 — Reports, search and CSV
- Status: TODO
- Reports and filtered export.
- Acceptance: filters compose correctly; export respects active user and selected filters.

## Milestone M3 — Quality and deployment

### QA-001 — Security and financial invariants audit
- Status: TODO
- Review permissions, concurrency, decimal math, deletion, date boundaries, CSV safety.
- Acceptance: documented tests pass; no known critical issue.

### DEP-001 — Deployment and recovery drill
- Status: TODO
- Choose current free-tier-compatible hosting, deploy frontend/backend/database, configure secrets and backups.
- Acceptance: production smoke test and database export/restore drill complete.

## Task selection rule

Complete one task or a small explicitly declared dependency group at a time. Do not mark a task DONE until its acceptance criteria are verified.
