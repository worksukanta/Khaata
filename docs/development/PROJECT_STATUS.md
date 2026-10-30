# Khaata Project Status

**Last updated:** 2026-10-30
**Current phase:** BE-005 (Transactions) implemented in the working tree (uncommitted; user handles Git), awaiting user review. BE-004 was committed as `8b6aca3`. Application implementation continues on the backend foundation.

## Approved baselines

- Step 1: SRS v1.0, MVP, and business rules approved.
- Step 2: modular monolith architecture and PostgreSQL schema baseline finalized.
- Step 3: Clean Fintech light theme with emerald accents, mobile-first navigation and screen criteria approved.
- Step 4: REST API contract, agent rules, backlog and checkpoint workflow prepared.

## Current decisions

- Frontend: React + TypeScript + Vite.
- Styling: Tailwind CSS aligned with `docs/ui-ux/DESIGN_SYSTEM.md`.
- Backend: Django + Django REST Framework.
- Database: PostgreSQL.
- Auth: Django session cookie + CSRF; verify same-site hosting behavior during deployment.
- Monthly books: created on demand with a database unique constraint.
- Combined dashboard: aggregates active transactions by date across all book types; separate book-type breakdowns.
- V1: no shared expense settlement, bank/UPI integration, receipt attachments, offline sync, or recurring transactions.

## Next milestone

Step 5 — vertical-slice implementation continues. BE-005 is complete (pending user review/merge). Next: `BE-006` (Budgets and allocations) or `BOOT-002` (CI baseline).

## Last known verification

BE-005: Django 5.2.18 + DRF 3.18.3; full suite `python -W error::DeprecationWarning -m pytest -q` → 355 passed (217 pre-existing + 138 new; in-memory SQLite; PostgreSQL not exercised, so partial indexes, `select_for_update(of=...)` and concurrency behaviour are untested on PostgreSQL); `manage.py check --settings=khaata.settings.test` → 0 issues; `makemigrations --check --dry-run` → no changes. OpenAPI YAML syntax not machine-validated (PyYAML not installed in the venv).

Previous (BE-004, post-review):
BE-004 (post-review): Django 5.2.18 + DRF 3.18.3; full suite `python -W error::DeprecationWarning -m pytest -v` → 217 passed (in-memory SQLite; PostgreSQL not exercised); `manage.py check --settings=khaata.settings.test` → 0 issues; `makemigrations --check --dry-run` → no changes; `git diff --check` → benign LF→CRLF warning on `docs/api/openapi.yaml` only (`.gitattributes` not configured; no code whitespace error). YAML syntax validated via `yaml.safe_load`; OpenAPI semantic validation not performed (no validator installed in venv). `seed_defaults` management command added and manually reviewed (not yet covered by automated tests).

Previous (BE-003, post-review):
BE-003 (post-review): Django 5.2.18 + DRF 3.18.3; `manage.py check` clean (0 issues); 150 tests pass with zero deprecation warnings under `-W error::DeprecationWarning` using in-memory SQLite (PostgreSQL not exercised); `makemigrations --check --dry-run` reports no changes; `git diff --check` clean. Three defects fixed during review: (1) `ensure_monthly_book` broad `IntegrityError` catch narrowed to re-raise on missing-row case; (2) `MAX_PAGE_SIZE: 100` added to `REST_FRAMEWORK` settings to match contract; (3) misindented test-file section comment fixed. Monthly ensure uniqueness, race safety, event/general CRUD, metadata update, and archive/restore rules all verified. No secrets committed.
