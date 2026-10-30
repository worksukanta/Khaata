# Changelog

## Unreleased

### BE-006 — Budgets and allocations (+ final review correction)
- Added `khaata.apps.budgets` with `Budget` (UUID PK; `owner` CASCADE; `scope` `MONTHLY_OVERALL`/`EVENT`; nullable `book` PROTECT; nullable `year`/`month`; `total_limit` `Decimal(14,2)`; timestamps) and `BudgetAllocation` (UUID PK; `budget` CASCADE; `category` PROTECT; `amount` `Decimal(14,2)`) models, migration `0001_initial`, admin, services, serializers, views and URLs. Registered in `INSTALLED_APPS` and routed at `/api/v1/budgets/`.
- Database constraints: `budget_scope_valid`, `budget_scope_fields_consistency`, `budget_total_limit_non_negative`, partial unique `unique_monthly_budget_per_owner_year_month` and `unique_event_budget_per_book`, `unique_budget_allocation_budget_category`, `budget_allocation_amount_non_negative`.
- Endpoints: `GET/POST /api/v1/budgets/` (filters `scope`, `year`, `month`, `book_id`), `GET/PATCH /api/v1/budgets/{id}/`, `PUT /api/v1/budgets/{id}/allocations/` (atomic full replacement under a budget row lock). User-scoped (cross-user → 404), CSRF-enforced on writes, paginated list.
- Spending is derived on every read from active EXPENSE transactions: a monthly budget counts every owned book by `transaction_date` within the calendar month (no double counting); an event budget counts only its event book regardless of date. Income and soft-deleted transactions are excluded. Remaining may be negative; utilization is Decimal-based and zero-limit safe; statuses `ON_TRACK` / `NEAR_LIMIT` (>= 80%) / `OVER_BUDGET` / `UNBUDGETED_SPENDING`. Overspending never blocks a transaction.
- Allocation rules: each category once, amount >= 0, active owned EXPENSE categories only, sum <= `total_limit`; `total_limit` cannot be lowered below the allocated total; `scope`/`book_id` immutable.
- `docs/api/openapi.yaml`: documented budget paths, request/response schemas and error behaviour.
- **Final review correction:** `BudgetAllocationInline` now uses a custom `BudgetAllocationFormSet` with a `clean()` method that enforces `sum(allocations) <= total_limit` before any DB write; correctly excludes deleted rows and handles multi-row submissions atomically. Added `test_budgets_admin.py` with 15 tests (8 formset unit tests + 7 admin change-view integration tests).
- 177 new tests (162 original + 15 admin); full suite 532 passed under `-W error::DeprecationWarning` (SQLite; PostgreSQL not exercised). Implementation complete; not yet merged.

### BE-005 — Transactions
- Added `Transaction` model to `khaata.apps.transactions` (UUID PK; `book` FK PROTECT; nullable `category`/`payment_method` FKs PROTECT; `type`; `amount` `Decimal(14,2)`; `transaction_date`; `description` (500); `created_at`/`updated_at`; `deleted_at`) and migration `0002_transaction`.
- Database constraints/indexes: `transaction_amount_positive` (amount > 0), `transaction_type_valid`; partial indexes `(book, transaction_date)` and `(transaction_date)` `WHERE deleted_at IS NULL`. `Transaction.objects` is the active-only manager; `Transaction.all_objects` is the unrestricted audit/admin manager.
- Service layer (`create_transaction`, `update_transaction`, `soft_delete_transaction`): atomic, row-locked; owner scoping through `book.owner`; category type must match transaction type; newly selected inactive category/payment method rejected (existing historical references are kept); archived books reject new/moved/edited/deleted transactions; MONTHLY books require a date inside their month; changing the date of a monthly-book transaction to another month atomically moves it to that month's book (ensured on demand); soft delete is idempotent.
- Endpoints: `GET/POST /api/v1/transactions/`, `GET/PATCH/DELETE /api/v1/transactions/{id}/` with filters `book_id`, `type`, `category_id`, `payment_method_id`, `date_from`, `date_to`, `search`, `ordering` and page-number pagination (default order `-transaction_date,-created_at`, deterministic `-id` tie-break). Malformed filters → 400. Cross-user/deleted ids → 404. Writes are CSRF-enforced.
- Admin registration (includes soft-deleted rows).
- `docs/api/openapi.yaml`: added `TransactionUpdate` schema, concrete `Transaction` response schema (nested `category`/`payment_method`), response codes and behaviour notes.
- 138 new tests; full suite 355 passed under `-W error::DeprecationWarning` (SQLite; PostgreSQL not exercised).

### BE-004 — Categories and payment methods (post-review)
- Added `khaata.apps.transactions` app with `Category` and `PaymentMethod` models (UUID PKs, owner FK, `is_active`, timestamps; categories also `type` INCOME/EXPENSE and `is_default`) and migration `0001_initial`.
- Database constraints: case-insensitive unique `(owner, type, lower(name))` for categories, case-insensitive unique `(owner, lower(name))` for payment methods, and a category type check constraint.
- Endpoints: `GET/POST /api/v1/categories/`, `PATCH /api/v1/categories/{id}/`, `GET/POST /api/v1/payment-methods/`, `PATCH /api/v1/payment-methods/{id}/`; user-scoped (cross-user → 404), CSRF-enforced on writes, filters `type`/`is_active`/`search`, paginated. Records are deactivated, never deleted; category `type` is immutable.
- Registration now atomically seeds default categories and payment methods (`seed_user_defaults`, idempotent).
- Default categories (11 EXPENSE + 5 INCOME): Food & Dining, Groceries, Transport, Rent, Utilities, Shopping, Health, Entertainment, Education, Travel, Other (EXPENSE); Salary, Business, Investments, Gifts, Other (INCOME). These are an implementation choice; approved docs specify "sensible defaults" without an explicit list.
- Default payment methods (6, contract-specified): Cash, UPI, Bank Transfer, Debit Card, Credit Card, Other.
- **Review corrections (BE-004 review pass):**
  - Added `management/commands/seed_defaults.py` management command for idempotent backfill of existing users: `python manage.py seed_defaults [--dry-run] [--email <email>] [--include-inactive]`.
  - `docs/api/openapi.yaml`: `UpdateCategoryRequest` schema now documents the accepted `type` field (must equal existing type; a change returns 400).
- Updated `docs/api/openapi.yaml` for the new paths and schemas.
- 67 new tests; full suite 217 passed under `-W error::DeprecationWarning` (SQLite; PostgreSQL not exercised).

### BE-003 — Books and monthly ensure (review pass)
- Created `khaata.apps.books` app with `Book` model, database constraints, services, serializers, views, and URL routing.
- Implemented `Book` model with UUID PK, owner FK, type enum (`MONTHLY`, `EVENT`, `GENERAL`), name, description, year, month, start_date, end_date, opening_balance (`DecimalField(max_digits=14, decimal_places=2)`), is_archived, created_at, and updated_at.
- Database constraints enforced:
  - `book_type_year_month_consistency`: check constraint ensuring `MONTHLY` books have non-null year and month (1-12), and `EVENT`/`GENERAL` books have null year and month.
  - `unique_monthly_book_per_user_year_month`: partial unique constraint on `(owner_id, year, month) WHERE type='MONTHLY'`.
  - `book_end_date_gte_start_date`: check constraint ensuring `end_date >= start_date` when both are provided.
  - `book_opening_balance_non_negative`: check constraint ensuring `opening_balance >= 0`.
- Implemented service layer (`khaata.apps.books.services`):
  - `ensure_monthly_book(user, year, month)`: idempotent ensure operation returning `(book, created)` with atomic transaction and concurrency race condition handling (catching `IntegrityError`).
  - `create_book(user, data)`: creates `EVENT` or `GENERAL` books; rejects direct creation of `MONTHLY` books.
  - `update_book(book, data)`: allows updating editable fields on active `EVENT`/`GENERAL` books; prevents editing archived books, monthly books, or changing book type.
  - `archive_book(book)` and `restore_book(book)`: toggles `is_archived` on `EVENT`/`GENERAL` books; rejects archiving/restoring monthly books.
- Implemented endpoints under `/api/v1/books/`:
  - `GET /api/v1/books/`: paginated list scoped to authenticated user, supporting filters (`type`, `is_archived`), substring search (`search`), and ordering (`name`, `-name`, `created_at`, `-created_at`).
  - `POST /api/v1/books/`: create `EVENT` or `GENERAL` books (returns 201); rejects `MONTHLY` type with 400 validation error.
  - `POST /api/v1/books/monthly/{year}/{month}/ensure/`: idempotent monthly ensure endpoint returning 201 when created, 200 when already present.
  - `GET /api/v1/books/{id}/`: retrieves owned book; returns 404 for cross-user or nonexistent IDs without leaking resource existence.
  - `PATCH /api/v1/books/{id}/`: updates metadata for owned event/general books; returns 400 on archived or monthly books.
  - `POST /api/v1/books/{id}/archive/` & `POST /api/v1/books/{id}/restore/`: archives/restores owned event/general books; returns 400 for monthly books.
- Added comprehensive unit and API integration test suite (65 new tests, total 150 tests across test suite).
- **Review corrections (BE-003 review pass):**
  - `services.py`: `ensure_monthly_book` — broad `IntegrityError` catch narrowed. The race-recovery `Book.objects.get()` is now wrapped in `try/except Book.DoesNotExist` that re-raises the captured `IntegrityError` when the row is unexpectedly absent, preventing CheckConstraint violations from being silently swallowed.
  - `settings/base.py`: Added `MAX_PAGE_SIZE: 100` to `REST_FRAMEWORK` to match the API contract's "maximum: 100" pagination rule.
  - `test_books_api.py`: Corrected misindented section comment (lines 199–201 were indented inside `test_list_books_pagination`; moved to module level).
- All 150 tests pass with zero deprecation warnings under `-W error::DeprecationWarning`; `manage.py check` clean; `makemigrations --check --dry-run` reports no changes.

### BE-002 — Custom user authentication endpoints
- Implemented `GET /api/v1/auth/csrf/` bootstrap endpoint for setting CSRF cookie.
- Implemented `POST /api/v1/auth/register/` supporting email, password (min 10 chars + Django validators), optional `display_name`, with email normalization (case-insensitive uniqueness) and no automatic login.
- Implemented `POST /api/v1/auth/login/` supporting email/password authentication, case-insensitive email matching, server-side session creation, and secure HttpOnly cookie.
- Implemented `POST /api/v1/auth/logout/` invalidating user session and returning 204 No Content.
- Implemented `GET /api/v1/auth/me/` and `PATCH /api/v1/auth/me/` allowing display_name and timezone updates with IANA timezone validation, and enforcing user data isolation.
- Implemented custom exception handler `khaata.core.exceptions.custom_exception_handler` normalizing all API errors to the standard `{ "error": { "code": "...", "message": "...", "details": { ... } } }` contract format.
- Added comprehensive test coverage (37 new tests, total 60 tests in test suite) covering successful/unsuccessful flows, CSRF enforcement, session invalidation, password hashing, and user isolation.
- **Security review corrections (BE-002 review pass):**
  - **Critical fix:** `POST /auth/login/` and `POST /auth/register/` were not CSRF-protected. DRF `APIView` is `csrf_exempt` and `SessionAuthentication` only enforces CSRF for authenticated requests, so views with `authentication_classes = []` skipped CSRF entirely (login CSRF). Added `khaata.core.authentication.CsrfEnforcedAnonymousAuthentication` (always runs Django's CSRF check, never authenticates) and applied it to both views. Missing/invalid token now returns `403` in the standard envelope.
  - Cookie settings in `settings/base.py` are now secure-by-default (`SESSION_COOKIE_SECURE`/`CSRF_COOKIE_SECURE=True`, `HttpOnly` session cookie, `SameSite=Lax`, CSRF cookie readable by the SPA); `development.py`/`test.py` explicitly relax `Secure` for local HTTP.
  - Added JSON `handler404`/`handler500` (`khaata.core.views`) for `/api/` paths so unknown routes and unexpected errors use the documented envelope with no internals; non-API paths keep Django defaults.
  - Exception handler now also maps Django's `PermissionDenied` to the envelope; concurrent duplicate registration (`IntegrityError`) returns `400 validation_error` instead of `500`.
  - Tests: 60 → 85 (login/register/logout CSRF with `enforce_csrf_checks=True`, session rotation, logout invalidation, uniform login failures, mixed-case email, protected-field PATCH, envelope consistency, cookie attributes, generic 500).
- All 85 tests pass with zero deprecation warnings under `-W error::DeprecationWarning`.

### BE-001 — Django project and settings
- Created Django + DRF backend foundation under `backend/`.
- Settings split into `base.py` (shared), `development.py` (env-driven), `test.py` (in-memory SQLite).
- PostgreSQL configuration via individual `DB_*` environment variables; documented SQLite fallback when all DB vars absent; `RuntimeError` on partial config.
- Declared `AUTH_USER_MODEL = "accounts.User"` before first migration; custom User model uses UUID PK, email as login identity, `display_name`, and `timezone` (default `Asia/Kolkata`).
- Email fully lowercased at creation time (local + domain) to enforce case-insensitive uniqueness, per `DATABASE_DESIGN.md`.
- Initial migration created and verified with `makemigrations --check --dry-run`.
- Health endpoint `GET /api/v1/health/` returns `{"status": "ok"}`; no authentication required; no sensitive data exposed.
- **Review corrections (BE-001 review pass):** upgraded Django 5.1.15 → 5.2.18 (LTS, fixes Python 3.14 `asyncio.iscoroutinefunction` deprecation); upgraded DRF 3.17.2 → 3.18.3 (latest stable); removed unused imports; added email normalization and 2 new tests.
- 23 tests pass with zero warnings under `-W error::DeprecationWarning`.
- `.env.example` updated with individual `DB_*` vars; `backend/.gitkeep` placeholder removed.

### Previous entries
- Prepared Step 4 API contract and OpenAPI baseline.
- Added cross-agent instructions, backlog, checkpoint template, and reusable task prompt.
- Preserved Step 2 architecture/ADR and Step 3 UI/UX documentation.
- BOOT-001: added empty `frontend/` and `backend/` placeholders for the monorepo skeleton.
