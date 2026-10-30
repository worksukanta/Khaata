# Khaata Implementation Backlog

Statuses: `TODO`, `IN_PROGRESS`, `BLOCKED`, `DONE`. Update status only after checking actual repository state.

## Milestone M0 — Repository foundation

### BOOT-001 — Initialize repository and monorepo skeleton
- Status: IN_PROGRESS (work complete in the working tree on branch `feat/BOOT-001-monorepo-skeleton`; awaiting the user's manual review and commit. Mark DONE once committed and the "clean Git status" acceptance check passes.)
- Notes: Git repository already existed (baseline commit `d4a2724`, remote `origin`); no second repo initialized. Added `frontend/.gitkeep` and `backend/.gitkeep`. Verified `.gitignore`, `.env.example`, README, `AGENTS.md`/`CLAUDE.md`/`CODEX.md`, PR template and issue templates. `.gitignore` left unchanged (already covers env files, venvs, node_modules, caches, logs, secrets).
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
- Status: IN_PROGRESS (implementation complete and review-corrected on `feat/BE-001-django-settings`; awaiting user review and merge)
- Created Django project under `backend/khaata/`; settings split into `base.py`, `development.py`, `test.py`.
- Environment-driven config via `python-decouple`; PostgreSQL with individual `DB_*` vars; documented SQLite fallback; partial config raises `RuntimeError`.
- Custom `User` model (UUID PK, email login, `display_name`, `timezone=Asia/Kolkata`) declared in `accounts` app and configured via `AUTH_USER_MODEL` before the first migration; email fully lowercased on creation for case-insensitive uniqueness per `DATABASE_DESIGN.md`.
- Initial migration generated after model was in place; `makemigrations --check --dry-run` passes.
- Health endpoint `GET /api/v1/health/` returns `{"status": "ok"}`; no auth required; no secrets exposed.
- Review corrections applied: Django 5.1.15 → 5.2.18 (LTS); DRF 3.17.2 → 3.18.3 (latest stable); unused imports removed; 2 email normalization tests added.
- 23 tests pass with zero warnings under `-W error::DeprecationWarning`; Django system check clean.
- `.env.example` updated with individual `DB_*` vars and explanatory comments. `backend/.gitkeep` replaced by real files.
- Acceptance: fresh setup instructions work; secrets absent from repo; health endpoint responds; tests pass.

### BE-002 — Custom user and authentication
- Status: IN_PROGRESS (implementation complete on `feat/BE-002-auth-endpoints`; awaiting user review and merge)
- Implemented full authentication slice: `GET /api/v1/auth/csrf/`, `POST /api/v1/auth/register/`, `POST /api/v1/auth/login/`, `POST /api/v1/auth/logout/`, `GET /api/v1/auth/me/`, `PATCH /api/v1/auth/me/`.
- Session-cookie authentication with CSRF protection and bootstrap endpoint.
- Registration with email normalization (case-insensitive uniqueness), min length 10 + Django password validators, optional display_name, no auto-login.
- Standard error envelope `{ "error": { "code": "...", "message": "...", "details": { ... } } }` normalized via `khaata.core.exceptions.custom_exception_handler`.
- Security review pass: login and register now enforce CSRF for anonymous callers (`CsrfEnforcedAnonymousAuthentication`); secure-by-default cookie settings; JSON 404/500 handlers for `/api/`; IntegrityError race on registration handled.
- Total 85 tests pass with zero deprecation warnings under `-W error::DeprecationWarning`; Django system check is clean.
- Deferred (not in API contract): login throttling mentioned in `SYSTEM_ARCHITECTURE.md` section on security; no throttle classes configured. Track for a hardening/deployment task.
- Acceptance: auth tests, password validation, CSRF tests, cross-user isolation verified.

### BE-003 — Books and monthly ensure
- Status: IN_PROGRESS (implementation complete on `feat/BE-003-books-monthly-ensure`; awaiting user review and merge)
- Created `khaata.apps.books` app with `Book` model, database constraints, services, serializers, views, and URL routing.
- Database constraints: `book_type_year_month_consistency`, `unique_monthly_book_per_user_year_month`, `book_end_date_gte_start_date`, `book_opening_balance_non_negative`.
- Service layer: `ensure_monthly_book` (idempotent, atomic, concurrent-race safe), `create_book` (rejects monthly), `update_book` (protects monthly and archived), `archive_book`/`restore_book` (protects monthly).
- Endpoints: `GET /api/v1/books/`, `POST /api/v1/books/`, `POST /api/v1/books/monthly/{year}/{month}/ensure/`, `GET /api/v1/books/{id}/`, `PATCH /api/v1/books/{id}/`, `POST /api/v1/books/{id}/archive/`, `POST /api/v1/books/{id}/restore/`.
- Total 150 tests pass with zero deprecation warnings under `-W error::DeprecationWarning`; Django system check is clean.
- Acceptance: monthly uniqueness under repeated/concurrent calls; event/general CRUD; archive rules verified.

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
