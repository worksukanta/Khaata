# Khaata Project Status

**Last updated:** 2026-10-31
**Current phase:** BE-008 (CSV export) implemented in the working tree (uncommitted; user handles all Git operations), awaiting user review and merge. BE-001–BE-006 are committed on `main` (latest `153adef`, BE-006). BE-007 (Dashboard and reports) is also implemented but not yet merged.

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

Step 5 — vertical-slice implementation continues. BE-007 and BE-008 are both implemented (pending user review/merge). Next: `BOOT-002` (CI baseline) or `FE-001` (React/Vite/TypeScript setup), only after BE-007 and BE-008 are reviewed and merged.

## Last known verification

BE-008: Django 5.2.18 + DRF 3.18.3; focused `pytest khaata/apps/exports` → 47 passed; full suite `.venv/Scripts/python -W error::DeprecationWarning -m pytest -q` → 665 passed (618 pre-existing + 47 new; in-memory SQLite; **PostgreSQL not exercised**); `manage.py check --settings=khaata.settings.test` → 0 issues; `makemigrations --check --dry-run` → no changes (no models added); `git diff --check` → clean. OpenAPI YAML not machine-validated (PyYAML and other YAML/OpenAPI tooling are not installed; no dependency was added).

Previous (BE-007): Django 5.2.18 + DRF 3.18.3; focused `pytest khaata/apps/reports` → 86 passed; full suite `python -W error::DeprecationWarning -m pytest -q` → 618 passed (532 pre-existing + 86 new; in-memory SQLite; **PostgreSQL not exercised** — behaviour of `Sum`/`values()` grouping and the partial indexes on PostgreSQL, and query plans, are unverified); `manage.py check --settings=khaata.settings.test` → 0 issues; `makemigrations --check --dry-run` → no changes (no models added); `git diff --check` → clean. OpenAPI YAML not machine-validated (PyYAML and other YAML/OpenAPI tooling are not installed; no dependency was added): only a tab/indent sanity check was run.

Previous (BE-006, final review correction):
BE-006 (final review correction): Django 5.2.18 + DRF 3.18.3; full suite `python -W error::DeprecationWarning -m pytest -q` → 532 passed (517 pre-existing + 15 new admin tests; in-memory SQLite; PostgreSQL not exercised, so partial unique indexes, `select_for_update` row locking and true concurrency are untested on PostgreSQL); `manage.py check --settings=khaata.settings.test` → 0 issues; `makemigrations --check --dry-run` → no changes; `git diff --check` → benign LF→CRLF notice on pre-existing `base.py` only (unchanged, no code whitespace errors); new admin files are clean. OpenAPI YAML syntax not machine-validated (PyYAML not installed in the venv). Admin allocation cap enforcement: `BudgetAllocationFormSet.clean()` validates aggregate `sum(allocations) <= total_limit` before any DB write; 8 unit tests + 7 integration tests all pass.

Previous (BE-005):
BE-005: Django 5.2.18 + DRF 3.18.3; full suite `python -W error::DeprecationWarning -m pytest -q` → 355 passed (217 pre-existing + 138 new; in-memory SQLite; PostgreSQL not exercised, so partial indexes, `select_for_update(of=...)` and concurrency behaviour are untested on PostgreSQL); `manage.py check --settings=khaata.settings.test` → 0 issues; `makemigrations --check --dry-run` → no changes. OpenAPI YAML syntax not machine-validated (PyYAML not installed in the venv).

Previous (BE-004, post-review):
BE-004 (post-review): Django 5.2.18 + DRF 3.18.3; full suite `python -W error::DeprecationWarning -m pytest -v` → 217 passed (in-memory SQLite; PostgreSQL not exercised); `manage.py check --settings=khaata.settings.test` → 0 issues; `makemigrations --check --dry-run` → no changes; `git diff --check` → benign LF→CRLF warning on `docs/api/openapi.yaml` only (`.gitattributes` not configured; no code whitespace error). YAML syntax validated via `yaml.safe_load`; OpenAPI semantic validation not performed (no validator installed in venv). `seed_defaults` management command added and manually reviewed (not yet covered by automated tests).

Previous (BE-003, post-review):
BE-003 (post-review): Django 5.2.18 + DRF 3.18.3; `manage.py check` clean (0 issues); 150 tests pass with zero deprecation warnings under `-W error::DeprecationWarning` using in-memory SQLite (PostgreSQL not exercised); `makemigrations --check --dry-run` reports no changes; `git diff --check` clean. Three defects fixed during review: (1) `ensure_monthly_book` broad `IntegrityError` catch narrowed to re-raise on missing-row case; (2) `MAX_PAGE_SIZE: 100` added to `REST_FRAMEWORK` settings to match contract; (3) misindented test-file section comment fixed. Monthly ensure uniqueness, race safety, event/general CRUD, metadata update, and archive/restore rules all verified. No secrets committed.
