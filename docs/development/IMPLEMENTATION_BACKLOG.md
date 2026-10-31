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
- Status: IN_PROGRESS (implementation complete and independently reviewed on `feat/BE-004-categories-payment-methods`; awaiting user merge)
- Created `khaata.apps.transactions` app (per `SYSTEM_ARCHITECTURE.md` section 4) with `Category` and `PaymentMethod` models, migration `0001_initial`, services, serializers, views, URLs, admin. The `Transaction` model is intentionally not included (BE-005).
- Database constraints: `unique_category_owner_type_lower_name` (functional unique on `lower(name), owner, type`), `category_type_valid` (check), `unique_payment_method_owner_lower_name` (functional unique on `lower(name), owner`).
- Endpoints: `GET/POST /api/v1/categories/`, `PATCH /api/v1/categories/{id}/`, `GET/POST /api/v1/payment-methods/`, `PATCH /api/v1/payment-methods/{id}/`. No DELETE (deactivate via `is_active=false`); no detail GET (not in contract).
- Registration (`POST /auth/register/`) now seeds default categories and the six payment methods in the same DB transaction as user creation; seeding is idempotent (`seed_user_defaults`).
- **Review corrections (post-review):** Added `seed_defaults` management command for backfilling existing users; corrected OpenAPI `UpdateCategoryRequest` schema to document accepted `type` field.
- 217 tests pass (full suite) under `-W error::DeprecationWarning` on in-memory SQLite; PostgreSQL not exercised.
- Acceptance: ownership, type validations, case-insensitive uniqueness, CSRF, seeding covered.

### BE-005 — Transactions
- Status: IN_PROGRESS (implementation complete in the working tree; uncommitted — the user handles Git; awaiting user review and merge)
- Added `Transaction` model + migration `0002_transaction` to `khaata.apps.transactions`; constraints `transaction_amount_positive`, `transaction_type_valid`; partial indexes on `(book, transaction_date)` and `(transaction_date)` where `deleted_at IS NULL`; active-only default manager plus `all_objects`.
- Services: `create_transaction`, `update_transaction`, `soft_delete_transaction` (atomic, row-locked, owner-scoped via `book.owner`).
- Endpoints: `GET/POST /api/v1/transactions/`, `GET/PATCH/DELETE /api/v1/transactions/{id}/`; filters `book_id`, `type`, `category_id`, `payment_method_id`, `date_from`, `date_to`, `search`, `ordering`; `include_deleted` is NOT supported (contract reserves it for a future workflow).
- Implementation decisions (not explicit in the contract; see HANDOFF): referenced-object ownership failures in the body → 400 on the field with a generic "not found" message (identical for unknown and cross-user ids); archived books are read-only for create/move/edit/delete; MONTHLY book requires date within its month on create/move; repeated DELETE → 204; deleted transactions → 404 on GET/PATCH.
- 138 new tests; 355 total pass under `-W error::DeprecationWarning` (SQLite; PostgreSQL not exercised).
- Decimal amounts, validation, soft delete, filters, pagination.
- **Inactive-reference rule (decided in BE-004 review):** Service must reject creation/update of a transaction that references an inactive category or payment method. Existing transactions retain deactivated references (no cascade). Reactivation re-enables the option. This is a service-layer check; no schema change required.
- Acceptance: ownership, category compatibility, active-only references on write, date/month behavior, totals exclude deleted records.

### BE-006 — Budgets and allocations
- Status: DONE (committed by the user as `153adef`, merged to `main`).
- Created `khaata.apps.budgets` (per `SYSTEM_ARCHITECTURE.md` section 4) with `Budget` and `BudgetAllocation` models, migration `0001_initial`, services, serializers, views, URLs, admin. Registered in `INSTALLED_APPS`; routed at `/api/v1/budgets/`.
- Database constraints: `budget_scope_valid`, `budget_scope_fields_consistency` (MONTHLY_OVERALL = year + month 1–12 + no book; EVENT = book + no year/month), `budget_total_limit_non_negative`, partial unique `unique_monthly_budget_per_owner_year_month` (`WHERE scope='MONTHLY_OVERALL'`), partial unique `unique_event_budget_per_book` (`WHERE scope='EVENT'`); allocations: `unique_budget_allocation_budget_category`, `budget_allocation_amount_non_negative`. `Budget.book` and `BudgetAllocation.category` are `PROTECT`; allocations `CASCADE` with their budget; `Budget.owner` `CASCADE`.
- Endpoints: `GET/POST /api/v1/budgets/` (filters `scope`, `year`, `month`, `book_id`; fixed newest-period-first order), `GET/PATCH /api/v1/budgets/{id}/`, `PUT /api/v1/budgets/{id}/allocations/`. No DELETE (not in contract).
- Services: `create_budget`, `update_budget`, `replace_allocations` (atomic, parent budget row locked with `select_for_update`), `calculate_budget_spending`, `classify_utilization`. Spending is always derived from `Transaction.objects` (active-only) EXPENSE rows; nothing derived is stored.
- 162 new tests (77 model/service, 85 API); 517 total pass under `-W error::DeprecationWarning` (SQLite; PostgreSQL not exercised — locking, partial unique indexes and concurrency are untested there).
- Monthly/event budgets, atomic allocation replacement, derived utilization.
- Acceptance: allocation cap under concurrency (service-level lock implemented; true concurrency needs PostgreSQL to verify); zero-budget and overspending cases tested.

### BE-007 — Dashboard and reports
- Status: IN_PROGRESS (implementation complete in the working tree; uncommitted — the user handles all Git operations; awaiting user review and merge. Implementation complete ≠ merged.)
- Scope split: the original "Reports and CSV export" item is split. BE-007 = the three report endpoints; CSV export moved to **BE-008** (not started).
- Created `khaata.apps.reports` (no models, no migrations, no admin). Registered in `INSTALLED_APPS`; routed at `/api/v1/reports/`.
- Endpoints (read-only GET, session auth required): `/reports/monthly/?year=&month=`, `/reports/books/{id}/`, `/reports/budget-utilization/?year=&month=`. `year` 2000–2200 and `month` 1–12 are validated (400 `validation_error` otherwise).
- Services (`reports/services.py`): `monthly_report`, `book_report`, `budget_utilization_report`, `budget_summary`. Database-side aggregation only (`Sum` over `values()`); budget figures reuse BE-006 `calculate_budget_spending` / `classify_utilization` / `BudgetSerializer`. BE-006's private `_month_bounds` was renamed to public `month_bounds` (behaviour unchanged; one call site; covered by the BE-006 suite and new `test_month_bounds`).
- Behaviour: combined monthly totals count every active transaction of every owned book by `transaction_date`, once; `book_type_breakdown` always has MONTHLY/EVENT/GENERAL; `category_breakdown` is expense-only, `{category_id, category_name, total}`, largest first, uncategorised = `{null, "Uncategorised"}`; monthly `budget` block is `NOT_SET` with null figures when no budget exists; `recent_transactions` = latest 5 (`-transaction_date, -created_at, -id`) via `TransactionSerializer`. Book report adds `closing_balance = opening_balance + income - expense` (`Book.opening_balance` exists) and the event budget for EVENT books only (else `null`). Unknown/cross-user book ids → identical 404.
- 86 new tests (38 service, 48 API incl. a constant-query-count test); full suite 618 passed under `-W error::DeprecationWarning` (SQLite; PostgreSQL not exercised).
- Acceptance: event expenses count once in monthly totals (tested); cross-user isolation (tested); soft-deleted excluded (tested).

### BE-008 — CSV export
- Status: IN_PROGRESS (implementation complete in the working tree; uncommitted — the user handles all Git operations; awaiting user review and merge)
- `GET /api/v1/exports/transactions.csv` per `API_CONTRACT.md` section 8. New app `khaata.apps.exports`; no models, migrations, or admin; no new dependency.
- Filters: `book_id`, `type`, `category_id`, `payment_method_id`, `date_from`, `date_to`, `search` (same as `GET /transactions/`; malformed → 400; reuses `TransactionFilterSerializer`). No `ordering` parameter (not specified for export).
- Response: `text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="transactions.csv"`. Columns: `id, book_id, type, amount, transaction_date, category_id, category_name, payment_method_id, payment_method_name, description, created_at, updated_at`. Amount = decimal string; dates = ISO 8601.
- Security: user-controlled text cells (`description`, `category_name`, `payment_method_name`) starting with `=`, `+`, `-`, `@` are prefixed with a tab (OWASP CSV injection mitigation). Ownership enforced via `book__owner=request.user`. Uses `Transaction.objects` (active-only manager) — soft-deleted rows never exported. Cross-user book_id filter returns empty result (not an error).
- 47 new tests; full suite 665 passed under `-W error::DeprecationWarning` (SQLite; PostgreSQL not exercised).
- Acceptance: CSV formula injection mitigated (tested); no other users' or soft-deleted rows exported (tested); all filters tested; authentication tested; malformed inputs → 400 tested.

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
