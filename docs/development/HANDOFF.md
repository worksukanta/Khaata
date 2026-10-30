# Khaata Agent Handoff Checkpoint

## Current checkpoint ID
`KH-CP-007-BE-002`

## State
Steps 1–4 approved. BOOT-001 was committed by the user. BE-001 is complete. BE-002 authentication endpoints implementation is complete and security-reviewed on `feat/BE-002-auth-endpoints`, awaiting user review and merge. Implemented `GET /api/v1/auth/csrf/`, `POST /api/v1/auth/register/`, `POST /api/v1/auth/login/`, `POST /api/v1/auth/logout/`, `GET /api/v1/auth/me/`, and `PATCH /api/v1/auth/me/`. Review fix: login/register now enforce CSRF for anonymous callers via `khaata.core.authentication.CsrfEnforcedAnonymousAuthentication` (the earlier `authentication_classes = []` silently bypassed CSRF). Frontend must call `GET /auth/csrf/` and send `X-CSRFToken` on login and register, and re-read the `csrftoken` cookie after login (Django rotates it). Base settings now default cookies to Secure; dev/test relax it. All 85 tests pass with zero deprecation warnings under `-W error::DeprecationWarning`; system check and migrations check are clean. PostgreSQL was not exercised. Login throttling is not implemented (not in the API contract; architecture lists it as hardening). No secrets committed.

## Read first
1. `AGENTS.md`
2. `docs/development/PROJECT_STATUS.md`
3. `docs/development/IMPLEMENTATION_BACKLOG.md`
4. `docs/api/API_CONTRACT.md`
5. `docs/api/openapi.yaml`
6. `docs/architecture/SYSTEM_ARCHITECTURE.md`
7. `docs/architecture/DATABASE_DESIGN.md`
8. `docs/ui-ux/UI_UX_SPECIFICATION.md`
9. `docs/ui-ux/DESIGN_SYSTEM.md`

## Next task
After user review and merge: `BE-003` — Books and monthly ensure (models, constraints, services, serializers, endpoints `/books/`, `/books/{id}/`, `/books/monthly/{year}/{month}/ensure/`, `/books/{id}/archive/`, `/books/{id}/restore/`). Refer to `docs/api/API_CONTRACT.md` section 3 and `docs/architecture/DATABASE_DESIGN.md`.

## BE-002 file inventory (for reconciliation by next agent)
New files created in `backend/`:
- `khaata/core/__init__.py`
- `khaata/core/exceptions.py`
- `khaata/core/authentication.py` (review pass)
- `khaata/core/views.py` (review pass: JSON 404/500 handlers)
- `tests/test_settings_security.py` (review pass)
- `khaata/apps/accounts/serializers.py`
- `khaata/apps/accounts/views.py`
- `khaata/apps/accounts/urls.py`
- `khaata/apps/accounts/test_auth_api.py`
- `tests/test_exceptions.py`

Modified files:
- `backend/khaata/settings/base.py` — added `EXCEPTION_HANDLER` configuration; review pass added secure-by-default session/CSRF cookie settings
- `backend/khaata/urls.py` — review pass: `handler404`/`handler500`
- `backend/khaata/core/exceptions.py`, `backend/khaata/apps/accounts/{views,serializers,test_auth_api}.py` — review pass fixes/tests
- `backend/khaata/api_urls.py` — included accounts URLs under `auth/`
- `docs/development/IMPLEMENTATION_BACKLOG.md` — BE-002 status updated
- `docs/development/PROJECT_STATUS.md` — phase and verification updated
- `docs/development/HANDOFF.md` — checkpoint updated to `KH-CP-007-BE-002`
- `CHANGELOG.md` — BE-002 entry added

## Required agent behavior
- Inspect `git status`, current branch, latest commit, and file tree before edits.
- If work exists beyond this checkpoint, reconcile it; do not overwrite it.
- Execute only the selected backlog item.
- Add tests with implementation work.
- Record exact commands and outcomes.
- Update this checkpoint and project status before handing off.

## Known unresolved implementation choices
- Exact deployment providers are not frozen; compare current free-tier limits before deployment.
- Final CSRF bootstrap implementation and frontend/API origin arrangement must be tested end-to-end.
- Confirm the OpenAPI document with a validator and keep it synchronized with implementation.
- Confirm the `NEAR_LIMIT` threshold remains 80% in the shared contract.
