# Khaata Agent Handoff Checkpoint

## Current checkpoint ID
`KH-CP-012-BE-005`

## State
Steps 1–4 approved. BOOT-001 and BE-001–BE-004 were committed by the user (latest commit `8b6aca3`, BE-004). BE-005 (Transactions) is implemented in the working tree (uncommitted; the user handles all Git operations — none were performed by the agent). Awaiting user review/merge.

### BE-005 summary
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
After user review and merge of BE-005: `BE-006` — Budgets and allocations (or `BOOT-002` CI baseline). Budget/report code must use `Transaction.objects` (active-only) and `book__owner` scoping.

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
