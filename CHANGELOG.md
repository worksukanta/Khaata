# Changelog

## Unreleased

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
