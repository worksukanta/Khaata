# Khaata Agent Handoff Checkpoint

## Current checkpoint ID
`KH-CP-020-FE-002` (follows `KH-CP-019-FE-001`)

## State
Steps 1–4 approved. BOOT-001 and BE-001–BE-006 are committed on `main` by the user (latest `153adef`, BE-006). BE-007 (Dashboard and reports), BE-008 (CSV export), BE-009 (Backend integration & hardening), BOOT-002 (CI baseline), FE-001 (Frontend foundation), and FE-002 (Authentication screens and session integration) are all implemented in the working tree (uncommitted; the user handles all Git operations — none were performed by the agent). **All six implementations are complete; none are merged.** Awaiting user review/merge.

### FE-002 summary

#### What was built
- Authentication screens and session integration on top of FE-001 React/Vite foundation.
- **No backend files changed**; no Python dependencies; no migrations.

#### Architecture additions

```
frontend/src/
├── features/auth/
│   ├── AuthContext.tsx       — AuthProvider + useAuth hook (session restore, login, register, logout)
│   ├── PrivateRoute.tsx      — Protects authenticated routes; null while initializing, redirects to /login
│   ├── PublicOnlyRoute.tsx   — Guards /login and /register; redirects home when already logged in
│   ├── LoginPage.tsx         — UX-01: email + password form; API errors; loading state; destination restore
│   └── RegisterPage.tsx      — UX-02: display name + email + password + confirm; no auto-login on success
├── services/api/
│   └── auth.ts               — Added register() (POST /auth/register/) alongside existing login/logout/getMe
├── app/
│   ├── router/index.tsx      — Restructured: PublicOnlyRoute group, PrivateRoute+AppShell group, 404 catch-all
│   └── providers/index.tsx   — Added QueryClientProvider (TanStack Query) + AuthProvider
```

#### Session and CSRF strategy (unchanged from FE-001 auth.ts)
1. `GET /auth/csrf/` bootstrapped on mount to obtain `csrftoken` cookie.
2. Axios request interceptor attaches `X-CSRFToken` on all non-safe methods.
3. After `login()`, `bootstrapCsrf()` is called again to pick up the rotated CSRF token.
4. `withCredentials: true` on every request; session cookie travels automatically.
5. Session token never stored in localStorage.

#### AuthProvider state machine
- `initializing: true` → running `bootstrapCsrf()` + `GET /auth/me/`.
- If `/auth/me/` returns 200: `user` set to the returned `User`; `initializing: false`.
- If `/auth/me/` returns 401 or any error: `user = null`; `initializing: false`.
- `login()` → service login (rotates CSRF) → `GET /auth/me/` → set user.
- `register()` → service register → return User; **does NOT set user** (contract: no auto-login).
- `logout()` → service logout → set user to null.

#### Route guard behavior
- `PrivateRoute`: renders `null` during init (no flash redirect); `<Navigate to="/login" state={{ from: location }} replace>` when unauthenticated; `<Outlet />` when authenticated.
- `PublicOnlyRoute`: renders `null` during init; `<Navigate to="/" replace>` when authenticated; `<Outlet />` when unauthenticated.

#### Dependencies added
| Package | Version | Role |
|---|---|---|
| `@tanstack/react-query` | ^5.80.7 | Server-state management; shared QueryClient |

#### Tests added (62 new; 68 total)
| File | Tests |
|---|---|
| `AuthContext.test.tsx` | 12 |
| `RouteGuards.test.tsx` | 11 |
| `LoginPage.test.tsx` | 17 |
| `RegisterPage.test.tsx` | 21 |
| `smoke.test.tsx` (updated) | 5 (was 4) |

#### Local verification
- `tsc --noEmit` → 0 errors
- `eslint .` → 0 warnings / errors
- `vitest run` → **68 passed** (0 failed)
- `vite build` → `dist/assets/index-*.js` 432 kB (gzip 137 kB) · `dist/assets/index-*.css` 11.5 kB (gzip 3.1 kB)

#### Backend issues found
None. Backend authentication behavior (no auto-login on registration, CSRF enforcement, session cookies, `/auth/me/` 401 for unauthenticated) matches the API contract exactly.

#### Known issues / gaps
1. **Dev-dependency vulnerabilities (moderate, 12):** unchanged from FE-001 (minimatch transitive in ESLint; dev-only; within 90-day remediation window).
2. **TanStack Query DevTools:** not added (not needed for V1; add in a hardening pass if desired).
3. **No test for CSRF cookie value after rotation:** the CSRF rotation behavior is covered at the auth service level (unit-tested in `client.test.ts`); the round-trip with a real browser cookie is an integration concern covered by the backend test suite.

#### FE-002 file inventory
New files:
- `frontend/src/features/auth/AuthContext.tsx`
- `frontend/src/features/auth/PrivateRoute.tsx`
- `frontend/src/features/auth/PublicOnlyRoute.tsx`
- `frontend/src/features/auth/LoginPage.tsx`
- `frontend/src/features/auth/RegisterPage.tsx`
- `frontend/src/features/auth/AuthContext.test.tsx`
- `frontend/src/features/auth/RouteGuards.test.tsx`
- `frontend/src/features/auth/LoginPage.test.tsx`
- `frontend/src/features/auth/RegisterPage.test.tsx`

Modified files:
- `frontend/src/services/api/auth.ts` — added `register()` function
- `frontend/src/app/router/index.tsx` — restructured with route guards
- `frontend/src/app/providers/index.tsx` — added QueryClientProvider + AuthProvider
- `frontend/src/test/smoke.test.tsx` — added AuthContext mock
- `frontend/package.json` — added `@tanstack/react-query`
- `frontend/package-lock.json` — updated lockfile
- `docs/development/IMPLEMENTATION_BACKLOG.md` (FE-002 status → IN_PROGRESS)
- `docs/development/PROJECT_STATUS.md` (phase, next milestone, verification)
- `docs/development/HANDOFF.md` (checkpoint → KH-CP-020-FE-002)
- `CHANGELOG.md` (FE-002 entry)


### FE-001 summary

#### What was built
- `frontend/` React 19 + TypeScript 5.8 (strict) + Vite 6 + Tailwind CSS 3.4 + React Router 7 + Axios 1.9 + Vitest 5 application.
- No backend files changed; no Python dependencies added; no migrations.

#### Architecture

```
frontend/
├── src/
│   ├── app/
│   │   ├── router/index.tsx        — createBrowserRouter with all 11 routes (UX-01–UX-11)
│   │   └── providers/index.tsx     — RouterProvider wrapper (AuthProvider TBD in FE-002)
│   ├── assets/
│   │   └── index.css               — Tailwind directives + global base styles
│   ├── components/
│   │   └── layout/
│   │       ├── AppShell.tsx         — Root layout: Sidebar (lg+) + BottomNav (mobile) + <Outlet/>
│   │       ├── BottomNav.tsx        — 5-destination mobile nav, prominent Add button
│   │       ├── Sidebar.tsx          — 240px desktop sidebar
│   │       ├── NotFoundPage.tsx     — 404 page
│   │       └── PlaceholderPage.tsx  — Temporary placeholder for not-yet-implemented screens
│   ├── features/
│   │   └── home/
│   │       └── HomePage.tsx         — UX-03 shell (FE-001 scope only; full dashboard is FE-005)
│   ├── services/
│   │   └── api/
│   │       ├── client.ts           — Axios instance; withCredentials; CSRF interceptor; error normaliser
│   │       ├── auth.ts             — bootstrapCsrf(), login(), logout(), getMe()
│   │       └── index.ts            — barrel re-export
│   ├── test/
│   │   ├── setup.ts                — Vitest setup: @testing-library/jest-dom/vitest
│   │   ├── types.d.ts              — /// <reference types="@testing-library/jest-dom/vitest" />
│   │   ├── smoke.test.tsx          — 4 smoke tests (AppShell, routing, 404, placeholder)
│   │   └── client.test.ts          — 2 unit tests (getCsrfToken cookie helpers)
│   ├── types/
│   │   ├── index.ts                — User, Book, Transaction, Budget domain types
│   │   └── css.d.ts                — declare module '*.css'
│   └── main.tsx                    — createRoot entry point
├── public/
├── .env.example                    — VITE_API_BASE_URL documentation
├── eslint.config.mjs               — ESLint flat config (typescript-eslint + react-hooks)
├── index.html
├── package.json                    — npm scripts: dev, build, lint, typecheck, test
├── postcss.config.js
├── tailwind.config.js              — Khaata design tokens
├── tsconfig.json                   — strict, noEmit, vite/client + vitest/globals types
├── tsconfig.node.json              — composite for vite.config.ts / vitest.config.ts
├── vite.config.ts                  — @vitejs/plugin-react + /api proxy + source maps
└── vitest.config.ts                — jsdom env, setupFiles, path aliases
```

#### API client and CSRF strategy
1. `GET /api/v1/auth/csrf/` sets the `csrftoken` cookie (called via `bootstrapCsrf()`).
2. Axios request interceptor reads `getCookie('csrftoken')` and attaches `X-CSRFToken` header on POST/PUT/PATCH/DELETE.
3. After a successful `login()`, `bootstrapCsrf()` is called again to pick up the rotated token.
4. `withCredentials: true` on every request so the session cookie travels with API calls.
5. Session token never stored in `localStorage`.
6. Response interceptor wraps all non-envelope errors into the `ApiError` shape.

#### Design tokens established
| Token | Value | Tailwind class |
|---|---|---|
| brand-700 | #047857 | `text-brand-700`, `bg-brand-700` |
| brand-600 | #059669 | `bg-brand-600` |
| brand-50 | #ECFDF5 | `bg-brand-50` |
| surface | #FFFFFF | `bg-surface` |
| background | #F8FAFC | `bg-background` |
| text-primary | #0F172A | `text-text-primary` |
| text-secondary | #475569 | `text-text-secondary` |
| border | #E2E8F0 | `border-border` |
| success-text | #047857 | `text-success-text` |
| danger-text | #B91C1C | `text-danger-text` |
| danger-bg | #FEF2F2 | `bg-danger-bg` |
| warning-text | #92400E | `text-warning-text` |
| warning-bg | #FFFBEB | `bg-warning-bg` |

#### Dependencies introduced
| Package | Role | Reason |
|---|---|---|
| `react` 19 | UI framework | Approved stack |
| `react-dom` 19 | DOM renderer | Required by React |
| `react-router-dom` 7 | Client-side routing | Approved stack |
| `axios` 1.9 | HTTP client | Approved (API contract requires CSRF headers + credentials) |
| `vite` 6 | Build tool | Approved stack |
| `@vitejs/plugin-react` 4 | React fast-refresh | Required by Vite + React |
| `typescript` 5.8 | Type checking | Approved stack |
| `tailwindcss` 3.4 | Utility CSS | Approved stack |
| `autoprefixer`, `postcss` | CSS processing | Required by Tailwind |
| `vitest` 5 | Test runner | Replaces Jest; native Vite integration |
| `@testing-library/react` 16 | Component testing | Industry standard |
| `@testing-library/jest-dom` 6 | DOM matchers | Required with Testing Library |
| `@testing-library/user-event` 14 | User interaction | Available for FE-002+ tests |
| `jsdom` 26 | Browser env for tests | Required by Vitest jsdom mode |
| `eslint` 9 + `typescript-eslint` 8 | Linting | Approved toolchain |
| `eslint-plugin-react-hooks` 5 | Hook lint rules | React best practices |
| `eslint-plugin-react-refresh` 0.4 | HMR lint | Vite fast-refresh safety |
| `globals` 16 | ESLint globals | Required by flat config |
| `@types/node` | Node types | Needed by vite.config.ts / vitest.config.ts |
| `@vitest/coverage-v8` 5 | Coverage | Optional; used in CI coverage step if added later |

No Redux, Zustand, or other state libraries added (not required in FE-001; tracked per AGENTS.md §10).

#### CI changes
- **New file:** `.github/workflows/frontend-ci.yml` — single-job GitHub Actions workflow.
  - Triggers on push/PR to `main` (path filter: `frontend/**` or the workflow file).
  - Node 22 matrix (single version; Node LTS).
  - Steps: `npm ci` → `npm run typecheck` → `npm run lint` → `npm test` → `npm run build`.
  - Third-party actions: `actions/checkout@v4`, `actions/setup-node@v4`, `actions/cache` via `setup-node` `cache: npm`.
  - Permissions: `contents: read`.
  - **Does not modify** `backend-ci.yml`; both workflows run independently.
- **Manual action required (owner):** Add `Frontend (Node 22)` as a required status check in GitHub branch protection settings for `main`.

#### Local verification
- `tsc --noEmit` → 0 errors
- `eslint .` → 0 warnings / errors
- `vitest run` → **6 passed** (4 smoke, 2 unit; jsdom)
- `vite build` → `dist/index.html` 0.47 kB · `dist/assets/index-*.css` 9.73 kB (gzip 2.72 kB) · `dist/assets/index-*.js` 328.58 kB (gzip 103.55 kB) — built in ~5 s

#### Known issues / gaps
1. **Dev-dependency vulnerabilities (moderate, 12):** `minimatch < 11.0.1` used transitively by `typescript-eslint` and `eslint`; upstream has no fix for these specific transitive deps. All are dev-only tools that are not included in the production bundle. Acceptable per the security policy 90-day remediation window. Monitor for upstream fixes.
2. **No functional auth UI:** Login, register, and logout screens are placeholder pages; FE-002 implements them.
3. **No route protection:** Unauthenticated access to protected routes is not enforced; FE-002 adds an AuthProvider and `PrivateRoute` guard.
4. **No TanStack Query:** UI specification §8 mentions TanStack Query for server state; not added in FE-001 (no API calls yet). Add in FE-002 when live API data is needed.

#### FE-001 file inventory
New files:
- `.github/workflows/frontend-ci.yml`
- `frontend/index.html`
- `frontend/package.json`
- `frontend/tsconfig.json`
- `frontend/tsconfig.node.json`
- `frontend/vite.config.ts`
- `frontend/vitest.config.ts`
- `frontend/tailwind.config.js`
- `frontend/postcss.config.js`
- `frontend/eslint.config.mjs`
- `frontend/.env.example`
- `frontend/src/main.tsx`
- `frontend/src/App.tsx`
- `frontend/src/assets/index.css`
- `frontend/src/app/router/index.tsx`
- `frontend/src/app/providers/index.tsx`
- `frontend/src/components/layout/AppShell.tsx`
- `frontend/src/components/layout/BottomNav.tsx`
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/NotFoundPage.tsx`
- `frontend/src/components/layout/PlaceholderPage.tsx`
- `frontend/src/features/home/HomePage.tsx`
- `frontend/src/services/api/client.ts`
- `frontend/src/services/api/auth.ts`
- `frontend/src/services/api/index.ts`
- `frontend/src/types/index.ts`
- `frontend/src/types/css.d.ts`
- `frontend/src/test/setup.ts`
- `frontend/src/test/types.d.ts`
- `frontend/src/test/smoke.test.tsx`
- `frontend/src/test/client.test.ts`

Auto-generated (not to commit):
- `frontend/package-lock.json` (generated by `npm install`)
- `frontend/node_modules/` (excluded by root `.gitignore`)
- `frontend/dist/` (excluded by root `.gitignore`)

Updated documentation:
- `docs/development/IMPLEMENTATION_BACKLOG.md` (FE-001 status → IN_PROGRESS)
- `docs/development/PROJECT_STATUS.md` (phase, next milestone, verification)
- `docs/development/HANDOFF.md` (checkpoint → KH-CP-019-FE-001)
- `CHANGELOG.md` (FE-001 entry)


### BOOT-002 summary
- **New file:** `.github/workflows/backend-ci.yml` — two-job GitHub Actions workflow triggered on push/PR to `main` (path filter: `backend/**` or the workflow file itself).
- **New file:** `backend/khaata/settings/ci_postgres.py` — PostgreSQL settings for the CI service container; reads credentials from environment variables; no hardcoded secrets.
- **No models, migrations, admin, business logic, or dependency changes.**

#### Workflow jobs

| Job | Python | DB | Steps |
|-----|--------|----|-------|
| `test-sqlite` (matrix) | 3.12, 3.13 | SQLite in-memory | checkout → setup-python → cache pip → install deps → `manage.py check` → `makemigrations --check` → `pytest -W error::DeprecationWarning` → `git diff --check` |
| `test-postgres` | 3.13 | PostgreSQL 16 service container | checkout → setup-python → cache pip → install deps → `manage.py check` (ci_postgres) → `migrate` → `pytest -W error::DeprecationWarning --ds=khaata.settings.ci_postgres` |

#### PostgreSQL service container
- Image: `postgres:16`; database/user/password: `khaata_ci` (CI-only, no production connection)
- Health check: `pg_isready` every 5s, 10 retries
- The `test-postgres` job exercises: partial unique indexes (`WHERE type='MONTHLY'`, `WHERE scope='MONTHLY_OVERALL'`, `WHERE scope='EVENT'`, `WHERE deleted_at IS NULL`), `select_for_update` row locking, grouped `Sum` with `values()` and NULL handling, and all database constraints (CheckConstraints, UniqueConstraints, FK PROTECT).

#### Actions pinning
- `actions/checkout@v4` — stable v4 tag
- `actions/setup-python@v5` — stable v5 tag
- `actions/cache@v4` — stable v4 tag

#### Security
- `permissions: contents: read` (workflow-level)
- No secrets in workflow YAML (PostgreSQL credentials are throwaway CI-only values in plain text; no `${{ secrets.* }}` references needed)
- No deployment, publishing, or privileged steps

#### Local verification (no local PostgreSQL available)
- `ci_postgres.py` settings import correctly; PostgreSQL engine selected; confirmed via Python import test
- `manage.py check --settings=khaata.settings.ci_postgres` → 0 issues (with mock env vars)
- Full SQLite suite: `python -W error::DeprecationWarning -m pytest -q` → **679 passed**
- `git diff --check` → clean

#### Required manual action (owner)
To make both CI jobs required status checks that block PR merges, the repository owner must:
1. Navigate to **GitHub → Repository → Settings → Branches → Branch protection rules**
2. Add a protection rule for `main`
3. Enable **Require status checks to pass before merging**
4. Add the following required checks:
   - `Test (SQLite) — Python 3.12`
   - `Test (SQLite) — Python 3.13`
   - `Test (PostgreSQL 16) — Python 3.13`

No GitHub Secrets need to be configured for this workflow (the PostgreSQL credentials are inline CI-only values, not production secrets).

#### BOOT-002 file inventory
New files:
- `.github/workflows/backend-ci.yml`
- `backend/khaata/settings/ci_postgres.py`

Updated documentation:
- `docs/development/IMPLEMENTATION_BACKLOG.md`
- `docs/development/PROJECT_STATUS.md`
- `docs/development/HANDOFF.md`
- `CHANGELOG.md`

### BE-009 summary
- No new app, model, migration, or admin. Integration-and-hardening task.
- **New:** `backend/tests/test_integration.py` — 14 cross-module integration tests.
- **Fixed:** `docs/api/openapi.yaml` — `GET /books/` was missing the `ordering` query parameter (`name|-name|created_at|-created_at`); added.
- **Updated:** `CHANGELOG.md`, `docs/development/PROJECT_STATUS.md`, `docs/development/HANDOFF.md`.
- Verification: `pytest tests/test_integration.py` → 14 passed; full suite `python -W error::DeprecationWarning -m pytest -q` → 679 passed (665 pre-existing + 14 new; SQLite; **PostgreSQL not exercised**); `manage.py check` → 0 issues; `makemigrations --check --dry-run` → no changes; `git diff --check` → clean.
- PostgreSQL gap carries forward (same as BE-007 / BE-008).

#### Integration tests added (`backend/tests/test_integration.py`)
1. `test_registration_seeds_default_categories_and_payment_methods` — POST /auth/register/ seeds defaults.
2. `test_event_expense_counted_in_both_event_and_monthly_budget` — single event-book expense counted in both event and monthly budgets.
3. `test_income_transactions_excluded_from_budget_spending` — INCOME never counts against budget spending.
4. `test_soft_delete_removes_from_all_aggregations` — deletion removes from list/detail/reports/budget/CSV simultaneously.
5. `test_date_reassignment_in_monthly_book_updates_report` — monthly-book date change moves transaction and updates both months' reports.
6. `test_archived_book_transactions_visible_in_reports_and_budget` — archiving a book does not remove its transactions from reports or budget spending.
7. `test_opening_balance_not_income_closing_balance_formula` — opening balance excluded from income; `closing_balance = opening_balance + income − expense`.
8. `test_budget_overspend_never_blocks_transaction` — transactions always succeed even when budget is over-limit.
9. `test_monthly_report_counts_each_transaction_once` — `expense_total == sum(breakdown expenses)`.
10. `test_budget_utilization_report_matches_budget_detail` — utilization endpoint byte-matches direct budget detail.
11. `test_cross_user_isolation_across_all_endpoints` — no cross-user data leaks from any read endpoint.
12. `test_error_envelope_shape_is_consistent_across_modules` — every 4xx follows the standard error envelope.
13. `test_historical_reference_preserved_after_category_deactivation` — existing transactions keep inactive categories; new creation rejected.
14. `test_csv_export_consistent_with_transaction_list` — CSV IDs match list IDs; formula-injection escaping verified.

#### Security audit findings
- All querysets owner-scoped (`book__owner=request.user`, `owner=request.user`); path-id lookups use `get_object_or_404`. ✓
- CSRF enforced for all state-changing operations (`SessionAuthentication` + `CsrfViewMiddleware`). ✓
- Archived-book restrictions enforced in services for create/update/delete. ✓
- Soft-deleted transactions excluded from all aggregations via `Transaction.objects` (active-only manager). ✓
- Historical inactive-category/payment-method references preserved; new selections rejected. ✓
- Decimal arithmetic throughout; no float arithmetic; `DecimalField(max_digits=14, decimal_places=2)` on all money fields. ✓
- Monthly budget aggregation via single grouped `Sum` query per budget; event isolation correct. ✓
- CSV formula-injection: user-controlled text cells starting with `=`, `+`, `-`, `@` are tab-prefixed. ✓
- Error responses never expose stack traces, secrets, or other user data. ✓
- No secrets in code. ✓

#### API/OpenAPI mismatches found and fixed
- **`GET /books/` missing `ordering` parameter** — The contract (API_CONTRACT.md section 3) documents `ordering=name|-name|created_at|-created_at`; the implementation honours it; the YAML was not documenting it. Fixed.
- No other mismatches found between implementation and contract.

#### Known risks / outstanding gaps
- **PostgreSQL not exercised**: partial unique indexes, `select_for_update` behaviour, grouped `Sum` with `values()` and NULL handling all need a PostgreSQL run before deployment. This gap is inherited from all prior milestones.
- **OpenAPI not machine-validated**: PyYAML is not installed in the venv and no dependency was added. The YAML was editorially reviewed.
- **No true concurrency tests**: `select_for_update` locking (budget allocation replacement, transaction update) is exercised at the service layer but concurrent execution is not testable without PostgreSQL and threads.
- **`seed_defaults` management command** has no automated test coverage (carried forward from BE-004).

### BE-008 summary
- New app `khaata.apps.exports` (registered in `INSTALLED_APPS`; routed at `/api/v1/exports/`). No models, migrations, or admin. No new dependency.
- One endpoint (read-only GET, `IsAuthenticated`): `/exports/transactions.csv`.
- Accepts the same filters as `GET /transactions/`: `book_id`, `type`, `category_id`, `payment_method_id`, `date_from`, `date_to`, `search`. Malformed values → 400 `validation_error` (reuses `TransactionFilterSerializer`). Unknown `ordering` and all unrecognised query params are silently ignored.
- Returns `text/csv; charset=utf-8` with `Content-Disposition: attachment; filename="transactions.csv"`.
- Ownership enforced via `book__owner=request.user`; uses `Transaction.objects` (active-only manager) so soft-deleted rows are never exported.
- CSV columns (in order): `id`, `book_id`, `type`, `amount`, `transaction_date`, `category_id`, `category_name`, `payment_method_id`, `payment_method_name`, `description`, `created_at`, `updated_at`. Amount is a decimal string; dates are ISO 8601; timestamps are ISO 8601 with timezone.
- Formula-injection escaping: user-controlled text cells (`description`, `category_name`, `payment_method_name`) that start with `=`, `+`, `-`, or `@` are prefixed with a tab character (OWASP CSV injection mitigation). UUIDs and other non-user-text columns are never in scope.
- No pagination; the full filtered queryset is streamed into an in-memory buffer and returned as a single response.
- Default ordering: `-transaction_date, -created_at, -id` (same as the transaction list endpoint).
- Decisions not in the contract: (1) null `category`/`payment_method` export as empty string; (2) null `description` exports as empty string; (3) `ordering` query param is not accepted for export (not mentioned in the contract for this endpoint); (4) a `book_id` belonging to another user is valid UUID syntax and passes filter validation, but the `book__owner` scope returns zero rows (not an error).
- Verification: focused `pytest khaata/apps/exports` → 47 passed; full suite → 665 passed; `manage.py check` → 0 issues; `makemigrations --check --dry-run` → no changes; `git diff --check` → clean.
- Known gaps / follow-ups: PostgreSQL run still pending; large export performance (no streaming iterator; uses `io.StringIO` buffer — acceptable for V1 transaction volumes); no `ordering` parameter for export.

### BE-008 file inventory
New in `backend/khaata/apps/exports/`: `__init__.py`, `apps.py`, `views.py`, `urls.py`, `test_exports_api.py`.
Modified: `backend/khaata/settings/base.py` (INSTALLED_APPS), `backend/khaata/api_urls.py` (route), `docs/api/openapi.yaml`, `docs/development/{IMPLEMENTATION_BACKLOG,PROJECT_STATUS,HANDOFF}.md`, `CHANGELOG.md`.

### BE-007 summary
- New app `khaata.apps.reports` (registered in `INSTALLED_APPS`; routed at `/api/v1/reports/`). No models, migrations or admin. No new dependency.
- Endpoints (read-only GET, `IsAuthenticated`): `/reports/monthly/?year=&month=`, `/reports/books/{id}/`, `/reports/budget-utilization/?year=&month=`. `year` 2000–2200 and `month` 1–12 validated with `ReportPeriodQuerySerializer` (missing/invalid → 400 `validation_error`). Unknown and cross-user book ids → identical 404 (`book_report` does `Book.objects.get(id=, owner=user)`).
- Services (`reports/services.py`): `monthly_report`, `book_report`, `budget_utilization_report`, `budget_summary(budget|None)`, `get_monthly_budget`, `get_event_budget`. All transaction reads use `Transaction.objects` (active-only) filtered by `book__owner=user`; totals are one grouped `Sum` over `values("book__type", "type")` (no Python-side loading of rows); category breakdown is one grouped `Sum` over `values("category_id", "category__name")` then sorted in Python (total desc, name, id). Month window = `[first, first_of_next)` via `khaata.apps.budgets.services.month_bounds`.
- Reuse: `calculate_budget_spending`, `classify_utilization` and `BudgetSerializer` (BE-006), `TransactionSerializer` (BE-005). The only BE-006 change is renaming the private `_month_bounds` to public `month_bounds` (one call site; behaviour unchanged; the BE-006 suite still passes).
- Response details: monthly `budget` block = `{total_limit, spent, remaining, utilization_percent, status}`, all null with `status: "NOT_SET"` when no monthly overall budget exists (report-only state); `remaining` is a signed decimal string; `utilization_percent` is null for `UNBUDGETED_SPENDING`/`NOT_SET`. `book_type_breakdown` is always MONTHLY, EVENT, GENERAL. `category_breakdown` item = `{category_id, category_name, total}`, expense-only, uncategorised = `{null, "Uncategorised"}`. `recent_transactions` = latest 5 by `-transaction_date, -created_at, -id` with `select_related("category", "payment_method")`. Book report = `{book{id,type,name,is_archived}, income_total, expense_total, net_cash_flow, closing_balance, category_breakdown, budget}`; `closing_balance = Book.opening_balance + income - expense` (`opening_balance` exists in the Book model and DATABASE_DESIGN, so no discrepancy); `budget` = full `BudgetSerializer` output for the event budget of an EVENT book, else `null`. Budget utilization = `{period, budget}` with `budget` the `BudgetSerializer` output (identical to `GET /budgets/{id}/`) or `null`.
- Decisions not spelled out in the contract (**please confirm during review**):
  1. Book report `income_total`/`expense_total` cover ALL dates of the book (book-scoped, per API_CONTRACT section 9); no period filter exists on the endpoint.
  2. Book report `budget` is the full BE-006 `Budget` object (with allocations), not the compact monthly summary.
  3. `category_breakdown` ties are ordered by category name then id so ordering is deterministic.
  4. The reports app imports `month_bounds` from `khaata.apps.budgets.services` (public rename) rather than creating a separate shared utility module; the dependency direction is reports → budgets → transactions/books, with no cycle.
  5. GET report endpoints never create books (no `ensure_monthly_book` call); an unknown month simply returns zeroes.
  6. `API_CONTRACT.md` section 7 was left unchanged (its monthly example is consistent with the implementation); `openapi.yaml` is now the detailed reference for the report shapes. No contract conflict was found.
- Query behaviour: a constant number of queries for the monthly dashboard regardless of transaction volume (tested with a query-count comparison). Budget serializer cost for book/utilization reports is the BE-006 per-budget cost (2–3 queries).
- Verification: focused `pytest khaata/apps/reports` → 86 passed (38 service + 48 API); full suite `python -W error::DeprecationWarning -m pytest -q` → 618 passed (SQLite); `manage.py check --settings=khaata.settings.test` → 0 issues; `makemigrations --check --dry-run` → no changes; `git diff --check` → clean. OpenAPI YAML only sanity-checked for tabs/indentation (no YAML parser/validator installed; no dependency added). **PostgreSQL was not exercised**: grouped aggregation, NULL handling in `values()` grouping and index usage are unverified there.
- Known gaps / follow-ups: CSV export (BE-008) not implemented; PostgreSQL run still pending; no pagination on `category_breakdown` (bounded by the user's category count plus one).

### BE-007 file inventory
New in `backend/khaata/apps/reports/`: `__init__.py`, `apps.py`, `services.py`, `serializers.py`, `views.py`, `urls.py`, `test_reports_services.py`, `test_reports_api.py`.
Modified: `backend/khaata/apps/budgets/services.py` (`_month_bounds` → `month_bounds`), `backend/khaata/settings/base.py` (INSTALLED_APPS), `backend/khaata/api_urls.py` (route), `docs/api/openapi.yaml`, `docs/development/{IMPLEMENTATION_BACKLOG,PROJECT_STATUS,HANDOFF}.md`, `CHANGELOG.md`.

### Previous: BE-006 (committed as `153adef`)
#### BE-006 summary
- New app `khaata.apps.budgets` (registered in `INSTALLED_APPS`; routed at `/api/v1/budgets/`; per `SYSTEM_ARCHITECTURE.md` section 4 — no new dependency). Models `Budget` and `BudgetAllocation`, migration `0001_initial` (depends on `books.0001`, `transactions.0002`, the user model).
- `Budget`: UUID PK, `owner` (CASCADE), `scope` (`MONTHLY_OVERALL`/`EVENT`), `book` (nullable, **PROTECT**), `year`/`month` (nullable), `total_limit` `Decimal(14,2)`, timestamps. Constraints: `budget_scope_valid`, `budget_scope_fields_consistency`, `budget_total_limit_non_negative`, partial unique `unique_monthly_budget_per_owner_year_month` (`WHERE scope='MONTHLY_OVERALL'`), partial unique `unique_event_budget_per_book` (`WHERE scope='EVENT'`). `owner`/`book` FK indexes are Django defaults; no speculative extra indexes (DATABASE_DESIGN section 5).
- `BudgetAllocation`: UUID PK, `budget` (CASCADE), `category` (**PROTECT**), `amount` `Decimal(14,2)`. Constraints: `unique_budget_allocation_budget_category`, `budget_allocation_amount_non_negative`.
- Services (`budgets/services.py`): `create_budget(user, data)`, `update_budget(user, id, data)`, `replace_allocations(user, id, allocations)`, `calculate_budget_spending(budget)`, `classify_utilization(limit, spent)`. Writes are atomic; `update_budget` and `replace_allocations` lock the budget row (`select_for_update`) so allocation total and limit changes serialize. Create handles a racing duplicate via the partial unique constraint (`IntegrityError` → 400 duplicate). Views/serializers hold no business rules beyond format validation.
- Endpoints: `GET/POST /budgets/`, `GET/PATCH /budgets/{id}/`, `PUT /budgets/{id}/allocations/`. No DELETE and no `ordering` parameter (not in contract). Writes are CSRF-enforced; every endpoint requires auth; cross-user/unknown ids → identical 404; list filters `scope`, `year`, `month`, `book_id` (malformed → 400); fixed order `year desc NULLS LAST, month desc NULLS LAST, scope, -created_at, -id`.
- Spending rules (derived on every read from `Transaction.objects`, never stored): **MONTHLY_OVERALL** = active EXPENSE transactions of every book owned by the budget owner (MONTHLY/EVENT/GENERAL, archived or not) with `transaction_date` in `[first_of_month, first_of_next_month)`; **EVENT** = active EXPENSE transactions of that event book regardless of date. Income and soft-deleted rows never count. Only the many-to-one `book` join is used, so a transaction counts once per budget; an event expense counts once in its event budget *and* once in the monthly budget (distinct scopes, one transaction). Uncategorised expenses consume the overall limit but no category allocation (`uncategorised_spent`, `unallocated_spent`). Category spend is a grouped `Sum` (Decimal), total = sum of the groups.
- Status/utilization (`classify_utilization`, Decimal only, no division by zero): `remaining = limit - spent` (negative when over); `utilization_percent = spent*100/limit` rounded half-up to 2 dp; status from the **exact** ratio: `OVER_BUDGET` (> 100%), `NEAR_LIMIT` (>= 80% and <= 100%), else `ON_TRACK`; `limit == 0` with spending → `UNBUDGETED_SPENDING` and `utilization_percent: null`; `limit == 0` and no spending → `ON_TRACK` / `"0.00"`. Overspending never blocks a transaction (tested through both the service and the API).
- Allocation rules: full replacement; category at most once; amount >= 0 (zero allowed); category must be an owned, **active, EXPENSE** category; sum <= `total_limit` (equal allowed); empty list clears; any failure rolls back and keeps the previous rows. Item errors are keyed by item index (`{"allocations": {"0": {"category_id": [...]}}}`); the cap error is `{"allocations": ["..."]}`.
- Decisions not spelled out in the contract (**please confirm during review**):
  1. Response field names for derived values (`spent`, `remaining`, `utilization_percent`, `status`, `allocated_total`, `unallocated`, `unallocated_spent`, `uncategorised_spent`, per-allocation `category{id,name,type,is_active}`, `amount`, `spent`, `remaining`, `utilization_percent`, `status`). The contract only lists the concepts; the `budget` object in the monthly report example (`total_limit/spent/remaining/utilization_percent/status`) was mirrored. Money is a decimal string (`remaining` may be negative).
  2. Budget `status` enum: `ON_TRACK`, `NEAR_LIMIT`, `OVER_BUDGET`, `UNBUDGETED_SPENDING`. `NOT_SET` is meaningful only when no budget exists (reports, BE-007). `NEAR_LIMIT` threshold is the baseline 80% from the contract (still to be formally frozen). A zero limit with zero spending is `ON_TRACK`/`"0.00"` (BR-05 allows "0% or Not allocated").
  3. Body reference failures (`book_id`, allocation `category_id`) → **400 on that field** with an identical generic "not found" message for unknown and cross-user ids (same convention as BE-005); path ids → 404.
  4. `PATCH` rules: `total_limit` below the current allocation total → 400 (contract: "subject to … allocation constraints"); `year`/`month` of a MONTHLY_OVERALL budget may be changed ("allowed period metadata") subject to uniqueness; `scope` and `book_id` are immutable (same value accepted, different → 400); year/month on an EVENT budget → 400.
  5. Year range for monthly budgets is 2000–2200, matching `ensure_monthly_book`; the list `year` filter uses the same range (out-of-range → 400, which also prevents DB integer overflow on huge values).
  6. Re-submitting an allocation whose category was deactivated since is rejected as a new selection ("All categories must be active"); an existing stored allocation to a now-inactive category remains visible (`category.is_active: false`). Allocations to categories are not removed on deactivation (history preserved).
  7. Archived event books may still receive/keep a budget (contract is silent; archived books stay reportable). Event budgets are only allowed on `EVENT` books.
  8. List/detail compute derived values per budget (2–3 queries each); acceptable for the page-size cap of 100 but not optimised.
- No contract conflict was found. `docs/api/openapi.yaml` updated (budget paths, `Budget`, `BudgetAllocation`, `BudgetUpdate`, `AllocationsReplace`, `PaginatedBudgets`, `SignedMoney`); YAML syntax not machine-validated (PyYAML absent) and OpenAPI semantics not validated.
- Verification: 517 tests pass (`python -W error::DeprecationWarning -m pytest -q`, in-memory SQLite — 355 pre-existing + 162 new); `manage.py check --settings=khaata.settings.test` 0 issues; `makemigrations --check --dry-run` no changes; `migrate` applied all migrations (including `budgets.0001_initial`) cleanly to a throwaway local SQLite file, deleted afterwards. **PostgreSQL was not exercised**: partial unique indexes, `select_for_update` row locking and genuine concurrent writes (concurrent allocation replacement / duplicate create) are untested there; SQLite ignores row locks. Run the suite against PostgreSQL before deployment.
- Known gaps / follow-ups: no true concurrency test (needs PostgreSQL); no DELETE endpoint; reports/dashboard budget summary (`/reports/monthly/` `budget` object and `/reports/budget-utilization/`) are BE-007 and should reuse `calculate_budget_spending` / `classify_utilization` rather than re-implementing the rules.
- **Admin allocation cap: FIXED (BE-006 final review).** `BudgetAllocationInline` now uses `BudgetAllocationFormSet(BaseInlineFormSet)` with a `clean()` method that validates `sum(amounts for non-deleted rows) <= budget.total_limit` before any DB write. 15 tests added in `test_budgets_admin.py` (8 formset unit tests + 7 admin change-view integration tests). All 532 tests pass.

### BE-006 file inventory
New in `backend/khaata/apps/budgets/`: `__init__.py`, `apps.py`, `models.py`, `admin.py`, `services.py`, `serializers.py`, `views.py`, `urls.py`, `test_budgets_services.py`, `test_budgets_api.py`, `test_budgets_admin.py` (added by final review correction), `migrations/__init__.py`, `migrations/0001_initial.py`.
Modified: `backend/khaata/settings/base.py` (INSTALLED_APPS), `backend/khaata/api_urls.py` (route), `docs/api/openapi.yaml`, `docs/development/{IMPLEMENTATION_BACKLOG,PROJECT_STATUS,HANDOFF}.md`, `CHANGELOG.md`.

### Previous: BE-005 summary (committed as `81de3a4`)
- `Transaction` model + migration `0002_transaction` in `khaata.apps.transactions` (reuses the BE-004 app; no new app/dependency). Fields per `DATABASE_DESIGN.md`; no `owner` column (not in the approved schema) — ownership is always `book.owner`. FKs to book/category/payment method are `PROTECT`. Constraints: `transaction_amount_positive`, `transaction_type_valid`. Partial indexes `txn_book_date_active_idx (book, transaction_date)` and `txn_date_active_idx (transaction_date)` `WHERE deleted_at IS NULL`. `Transaction.objects` = active-only; `Transaction.all_objects` = audit/admin (used by the admin site and the soft-delete service).
- Services (`services.py`): `create_transaction(user, data)`, `update_transaction(user, txn_id, data)`, `soft_delete_transaction(user, txn_id)`. All atomic; the transaction row (and target book) is locked with `select_for_update`; lookups are owner-scoped (`book__owner=user`) and raise `Transaction.DoesNotExist` (views → 404) otherwise. Views/serializers contain no business rules beyond format validation.
- Endpoints: `GET/POST /api/v1/transactions/`, `GET/PATCH/DELETE /api/v1/transactions/{id}/`. List filters: `book_id`, `type`, `category_id`, `payment_method_id`, `date_from`, `date_to`, `search` (description `icontains`), `ordering` (`transaction_date|amount|created_at`, optionally `-`); default `-transaction_date,-created_at`, with `-id` as final tie-breaker for deterministic pagination. Malformed filter values → 400 `validation_error`; an unrecognised `ordering` silently falls back to the default (same as Books). `include_deleted` is not supported. Responses use the contract fields; `category` / `payment_method` are nested objects (`{id,name,type}` / `{id,name}`) or `null`; `book_id` is a plain UUID.
- Rules implemented: amount > 0, ≤ 2 decimals, ≤ 12 integer digits (Decimal only; JSON numbers are parsed as exact Decimal); category type must equal transaction type (also re-checked when only `type` changes); newly selected inactive category/payment method → 400, while an unchanged existing (even inactive) reference is retained on PATCH; `null` clears; reactivated references selectable again; archived books reject create / move-into / edit / delete; MONTHLY books require `transaction_date` inside their year/month on create and on move; a date change of a transaction in a MONTHLY book to another month atomically moves it to that month's book via `ensure_monthly_book` (rolled back with the rest of the update on failure); event/general books keep their book on date change; soft delete is idempotent (repeat → 204, original `deleted_at` kept); deleted transactions → 404 on GET/PATCH.
- Decisions not spelled out in the contract (please confirm during review):
  1. Body references (`book_id`, `category_id`, `payment_method_id`) that are missing or belong to another user → **400 on that field** with an identical generic "… not found." message (no cross-user disclosure). The contract's "return 404" rule is applied to path ids (`/transactions/{id}/`).
  2. Archived-book transactions are read-only (edit and delete rejected with 400 `detail`). The contract only says archived books "reject new entries" and are "read-only"; extending this to edit/delete follows the Books rule "Archived books remain reportable and are read-only".
  3. Moving a transaction (via `book_id`) into a MONTHLY book requires a date inside that month.
  4. A `description` of `""` is stored as `""`; omitted → `null`.
- No contract conflict was found; `docs/api/openapi.yaml` was extended (not altered semantically): `TransactionUpdate` schema, concrete `Transaction` response schema, response codes, behaviour notes. YAML syntax is unvalidated (PyYAML absent from venv).
- Verification: 355 tests pass (`python -W error::DeprecationWarning -m pytest -q`, SQLite); `manage.py check` 0 issues; `makemigrations --check --dry-run` no changes. **PostgreSQL not exercised** — partial indexes, `select_for_update(of=("self",))` and true concurrency are untested there (SQLite ignores row locks). Recommend running the suite against PostgreSQL before deployment.
- Known gaps / follow-ups: no concurrency test for simultaneous update/delete (needs PostgreSQL); `seed_defaults` command still has no automated tests (carried over from BE-004).

### BE-005 file inventory
New: `khaata/apps/transactions/migrations/0002_transaction.py`, `test_transactions_services.py`, `test_transactions_api.py`.
Modified: `khaata/apps/transactions/{models,services,serializers,views,urls,admin}.py`, `khaata/api_urls.py`, `docs/api/openapi.yaml`, `docs/development/{IMPLEMENTATION_BACKLOG,PROJECT_STATUS,HANDOFF}.md`, `CHANGELOG.md`.

### BE-004 summary (post-review)
- New app `khaata.apps.transactions` (registered in `INSTALLED_APPS`) with `Category` and `PaymentMethod` models and migration `0001_initial`. The `Transaction` model is NOT included (BE-005); future FKs from Transaction/BudgetAllocation must use `on_delete=PROTECT`.
- Constraints: functional unique `(lower(name), owner, type)` for categories; check on category type; functional unique `(lower(name), owner)` for payment methods.
- Endpoints: `GET/POST /api/v1/categories/` (filters `type`, `is_active`, `search`), `PATCH /api/v1/categories/{id}/`, `GET/POST /api/v1/payment-methods/` (filters `is_active`, `search`), `PATCH /api/v1/payment-methods/{id}/`. No DELETE and no detail GET (not in contract); deactivation is via `is_active=false`. Category `type` is immutable (a differing `type` in PATCH → 400). Names are whitespace-trimmed; duplicates → 400 `validation_error` on `name`. Cross-user ids → 404. List ordering is fixed (categories `type, name`; payment methods `name`); no `ordering` parameter (not in contract).
- Registration seeds defaults via `seed_user_defaults` inside the same `transaction.atomic()` as user creation (a seeding failure rolls back the user). Payment methods: Cash, UPI, Bank Transfer, Debit Card, Credit Card, Other (contract-specified). Default categories — Expense: Food & Dining, Groceries, Transport, Rent, Utilities, Shopping, Health, Entertainment, Education, Travel, Other; Income: Salary, Business, Investments, Gifts, Other. **The approved docs say "sensible defaults" without an explicit list; this list is an implementation choice — see review findings for recommendation.**
- Existing-user backfill: `python manage.py seed_defaults` management command added at `khaata/apps/transactions/management/commands/seed_defaults.py`. Idempotent; per-user transactions; supports `--dry-run`, `--email`, and `--include-inactive` flags. Safe to run more than once.
- `docs/api/openapi.yaml` updated with detail PATCH paths, schemas, `is_active` filter, and `UpdateCategoryRequest.type` field documentation (corrected by review). YAML syntax validated by Python `yaml.safe_load`; OpenAPI semantic validation not performed (no validator installed in venv).
- Verification (post-review): full suite 217 passed (`python -W error::DeprecationWarning -m pytest -v`, in-memory SQLite); `manage.py check` clean; `makemigrations --check --dry-run` no changes; `git diff --check` reports only a benign LF→CRLF line-ending warning on `docs/api/openapi.yaml` (`.gitattributes` not configured; no whitespace error in code). PostgreSQL not exercised.
- BE-005 inactive-reference decision: existing transactions must retain references to deactivated categories/payment methods; new transactions must reject inactive selections at the service layer. No database schema change is required. See review findings.

### Previous: BE-003 summary (committed)

Implemented `Book` model with UUID PK and database constraints (`book_type_year_month_consistency`, `unique_monthly_book_per_user_year_month`, `book_end_date_gte_start_date`, `book_opening_balance_non_negative`). Implemented service layer with `ensure_monthly_book` (atomic, race-safe, idempotent), `create_book`, `update_book`, `archive_book`, `restore_book`. Implemented endpoints `GET /api/v1/books/`, `POST /api/v1/books/`, `POST /api/v1/books/monthly/{year}/{month}/ensure/`, `GET /api/v1/books/{id}/`, `PATCH /api/v1/books/{id}/`, `POST /api/v1/books/{id}/archive/`, and `POST /api/v1/books/{id}/restore/`.

Review fixes applied: (1) `ensure_monthly_book` in `services.py` — broad `IntegrityError` catch narrowed: recovery `get()` is now wrapped in `try/except Book.DoesNotExist` that re-raises the original `IntegrityError` when the row is unexpectedly absent, preventing CheckConstraint violations from being silently swallowed. (2) `MAX_PAGE_SIZE: 100` added to `REST_FRAMEWORK` in `base.py` to match the API contract's stated maximum page size. (3) Misindented section comment in `test_books_api.py` (lines 199–201 were inside `test_list_books_pagination`) corrected to module level.

All 150 tests pass with zero deprecation warnings under `-W error::DeprecationWarning`; Django system check and migrations check are clean; `git diff --check` is clean. PostgreSQL was not exercised (used SQLite). No secrets committed.

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
`FE-003` — Books screens (monthly/event/general list, month navigation with `POST /books/monthly/{year}/{month}/ensure/` before opening, event/general create/edit/archive, empty/error states). Only after FE-002 is reviewed and merged by the user.

**FE-002 is complete** — see FE-002 summary above for the full checkpoint.

**Decision recorded for BE-005 (inactive-reference rule) — implemented:**
New transactions MUST reject an inactive category or payment method. Deactivated references on existing (historical) transactions are preserved intact. Reactivation restores the option for new entries. Implementation requirement: the `create_transaction` and `update_transaction` service functions must check `category.is_active` and `payment_method.is_active` and raise a validation error if either is False. No database schema change is needed — this is a service-layer check. Record in ADR if behaviour is changed from this recommendation after review.

Refer to `docs/api/API_CONTRACT.md` section 5 and `docs/architecture/DATABASE_DESIGN.md`.

## BE-004 file inventory
New in `backend/khaata/apps/transactions/`: `__init__.py`, `apps.py`, `models.py`, `admin.py`, `services.py`, `serializers.py`, `views.py`, `urls.py`, `tests.py`, `test_categories_payment_methods_api.py`, `migrations/__init__.py`, `migrations/0001_initial.py`.
New (added by review): `management/__init__.py`, `management/commands/__init__.py`, `management/commands/seed_defaults.py`.
Modified: `backend/khaata/settings/base.py` (INSTALLED_APPS), `backend/khaata/api_urls.py` (routes), `backend/khaata/apps/accounts/serializers.py` (atomic registration + seeding), `docs/api/openapi.yaml` (UpdateCategoryRequest schema corrected), `docs/development/IMPLEMENTATION_BACKLOG.md`, `PROJECT_STATUS.md`, `HANDOFF.md`, `CHANGELOG.md`.

## BE-003 file inventory (for reconciliation by next agent)
New files created in `backend/`:
- `khaata/apps/books/__init__.py`
- `khaata/apps/books/apps.py`
- `khaata/apps/books/models.py`
- `khaata/apps/books/admin.py`
- `khaata/apps/books/services.py`
- `khaata/apps/books/serializers.py`
- `khaata/apps/books/views.py`
- `khaata/apps/books/urls.py`
- `khaata/apps/books/tests.py`
- `khaata/apps/books/test_books_api.py`
- `khaata/apps/books/migrations/__init__.py`
- `khaata/apps/books/migrations/0001_initial.py`

Modified files:
- `backend/khaata/settings/base.py` — added `khaata.apps.books` to `INSTALLED_APPS`
- `backend/khaata/api_urls.py` — included books URLs under `books/`
- `docs/development/IMPLEMENTATION_BACKLOG.md` — BE-003 status updated
- `docs/development/PROJECT_STATUS.md` — phase and verification updated
- `docs/development/HANDOFF.md` — checkpoint updated to `KH-CP-008-BE-003`
- `CHANGELOG.md` — BE-003 entry added

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
