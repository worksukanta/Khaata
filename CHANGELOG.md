# Changelog

## Unreleased

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
