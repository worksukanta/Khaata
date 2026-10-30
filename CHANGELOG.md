# Changelog

## Unreleased

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
