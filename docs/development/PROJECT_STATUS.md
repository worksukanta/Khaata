# Khaata Project Status

**Last updated:** 2026-10-29
**Current phase:** BE-002 (Custom user and authentication) implementation complete on `feat/BE-002-auth-endpoints`, awaiting user review and merge. Application implementation continues on the backend foundation.

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

Step 5 — vertical-slice implementation continues. BE-002 is complete (pending user merge). Next: `BE-003` (Books and monthly ensure) or `BOOT-002` (CI baseline).

## Last known verification

BE-002 (after security review): Django 5.2.18 + DRF 3.18.3; `manage.py check` clean (0 issues); 85 tests pass with zero deprecation warnings under `-W error::DeprecationWarning` using in-memory SQLite (PostgreSQL not exercised); `makemigrations --check --dry-run` reports no changes. Review found and fixed missing CSRF enforcement on anonymous login/register; now verified with `Client(enforce_csrf_checks=True)`. Login throttling (architecture hardening item) is not implemented. No secrets committed.
