# Khaata REST API Contract

**Document ID:** KH-API-001  
**Version:** 1.0 baseline  
**Status:** Contract baseline for V1 implementation  
**Base path:** `/api/v1/`  
**Transport:** HTTPS in production; JSON except CSV export  
**Money format:** Decimal string, e.g. `"250.00"`  
**Identifiers:** UUID strings  
**Dates:** ISO 8601 calendar dates (`YYYY-MM-DD`)  
**Timestamps:** ISO 8601 with timezone offset or `Z`

## 1. Common conventions

### Authentication

Use Django session authentication for the browser application:
- Login establishes a server-side session and secure HttpOnly cookie.
- State-changing requests require CSRF protection.
- The frontend obtains a CSRF token through the documented bootstrap endpoint and sends it using `X-CSRFToken`.
- No authentication tokens are stored in local storage.
- Cross-origin production deployment must explicitly configure allowed origins, credentials, cookie SameSite/Secure settings, and CSRF trusted origins.

### Common error shape

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request contains invalid fields.",
    "details": {
      "amount": ["Ensure this value is greater than zero."]
    }
  }
}
```

Errors should be stable and safe. Never return stack traces or secrets. For DRF validation errors, normalize serializer errors into the documented shape.

### Pagination

List endpoints use page-number pagination:

```json
{
  "count": 42,
  "next": "https://example.invalid/api/v1/transactions/?page=2",
  "previous": null,
  "results": []
}
```

Default page size: 25; maximum: 100. The frontend must not assume all records fit in one response.

### Security and ownership

All resource queries are scoped to the authenticated user. Never trust a client-supplied owner ID. For resources owned by another user, return 404. Validate ownership of every referenced book, category, payment method, and budget.

## 2. Authentication endpoints

### `GET /auth/csrf/`
Returns a CSRF token/bootstrap response and sets the appropriate CSRF cookie.

Response `200`:
```json
{ "detail": "CSRF cookie set." }
```

### `POST /auth/register/`
Request:
```json
{
  "email": "user@example.com",
  "password": "a-strong-password",
  "display_name": "Khaata User"
}
```
Response `201`:
```json
{
  "id": "c5d11f7e-14c4-4e17-9d6c-12a3e44f0f00",
  "email": "user@example.com",
  "display_name": "Khaata User",
  "timezone": "Asia/Kolkata"
}
```
Registration does not automatically authenticate unless that behavior is explicitly adopted and tested. Duplicate email returns `400 validation_error` without exposing another user's private data.

### `POST /auth/login/`
Request:
```json
{ "email": "user@example.com", "password": "a-strong-password" }
```
Response `200`:
```json
{ "detail": "Login successful." }
```
Sets session cookie. Invalid credentials return a generic `400` or `401` response that does not disclose whether the email exists.

### `POST /auth/logout/`
Authenticated, CSRF-protected. Response `204`.

### `GET /auth/me/`
Response `200`:
```json
{
  "id": "c5d11f7e-14c4-4e17-9d6c-12a3e44f0f00",
  "email": "user@example.com",
  "display_name": "Khaata User",
  "timezone": "Asia/Kolkata"
}
```

### `PATCH /auth/me/`
Allows `display_name` and `timezone` updates only. Timezone must be a valid IANA timezone identifier.

## 3. Books

### `GET /books/`
Query parameters:
- `type=MONTHLY|EVENT|GENERAL`
- `search=<substring>`
- `is_archived=true|false`
- `ordering=name|-name|created_at|-created_at`

Returns paginated book objects.

### `POST /books/`
Creates only `EVENT` or `GENERAL` books. Monthly books must use the ensure endpoint.

Event request:
```json
{
  "type": "EVENT",
  "name": "Durga Puja 2026",
  "description": "Puja committee expenses",
  "start_date": "2026-10-16",
  "end_date": "2026-10-21"
}
```
General request:
```json
{ "type": "GENERAL", "name": "Household Miscellaneous" }
```
Response `201` includes `id`, `type`, `name`, `description`, dates, `opening_balance`, `is_archived`, `created_at`, `updated_at`, and derived totals if the endpoint's documented serializer includes them. Prefer keeping totals in report endpoints rather than mixing mutable-looking totals into the base object.

### `POST /books/monthly/{year}/{month}/ensure/`
Idempotently creates or retrieves the user's monthly book. Valid year/month required. The database unique constraint is authoritative under concurrency.

Response `200` if already present, `201` if created:
```json
{
  "id": "bdf73d4c-7a3d-4a6e-8c11-5e4f71c29350",
  "type": "MONTHLY",
  "name": "October 2026",
  "year": 2026,
  "month": 10,
  "is_archived": false
}
```
The API must never create duplicates if two requests race.

### `GET /books/{id}/`
Returns one accessible book and metadata.

### `PATCH /books/{id}/`
Allows name/description/date changes only for editable event/general books. Monthly book type/year/month are immutable. Archived books cannot be edited.

### `POST /books/{id}/archive/` and `/restore/`
Archive or restore an event/general book. Archived books remain reportable and are read-only. Monthly books are not archived in V1 unless an explicit ADR changes this rule.

## 4. Categories and payment methods

### `GET /categories/`
Filters: `type=INCOME|EXPENSE`, `is_active=true|false`, `search=<substring>`.

### `POST /categories/`
Request:
```json
{ "name": "Coffee", "type": "EXPENSE" }
```
Unique per user and type using case-insensitive name comparison. Seed default categories during registration.

### `PATCH /categories/{id}/`
Allows name and active status updates. Do not hard-delete a category referenced by historical transactions.

### `GET /payment-methods/`, `POST /payment-methods/`, `PATCH /payment-methods/{id}/`
Payment methods are user-owned labels (Cash, UPI, Bank Transfer, Debit Card, Credit Card, Other), not financial accounts. Referenced methods should be deactivated, not hard-deleted.

## 5. Transactions

### `GET /transactions/`
Query parameters:
- `book_id=<uuid>`
- `type=INCOME|EXPENSE`
- `category_id=<uuid>`
- `payment_method_id=<uuid>`
- `date_from=YYYY-MM-DD`
- `date_to=YYYY-MM-DD`
- `search=<description substring>`
- `ordering=transaction_date|-transaction_date|amount|-amount|created_at|-created_at`
- `page=<integer>`

Filters combine with AND semantics. Default ordering: `-transaction_date,-created_at`. Exclude soft-deleted records unless `include_deleted=true` is explicitly supported for a future audit/admin workflow; do not expose deleted entries in standard V1 lists.

### `POST /transactions/`
Request:
```json
{
  "book_id": "bdf73d4c-7a3d-4a6e-8c11-5e4f71c29350",
  "type": "EXPENSE",
  "amount": "250.00",
  "transaction_date": "2026-10-27",
  "category_id": null,
  "payment_method_id": null,
  "description": "Evening snacks"
}
```
Required: `book_id`, `type`, `amount`, `transaction_date`. UI may default the date to today, but the API requires a valid date. Amount must be greater than zero. Category type must match transaction type. All references must belong to the authenticated user. Archived books reject new entries.

Response `201` includes:
`id`, `book_id`, `type`, `amount`, `transaction_date`, `category`, `payment_method`, `description`, `created_at`, `updated_at`.

### `GET /transactions/{id}/`
Returns one active transaction owned through the user's book.

### `PATCH /transactions/{id}/`
Allows amount, type, date, book, category, payment method, and description updates. Validate all invariants after applying the proposed changes. A change to transaction date that crosses months must atomically move the entry to the matching monthly book only when the transaction is currently in a monthly book. For an event/general book, preserve the selected book; monthly reports still use the transaction date. This resolves the distinction between book ownership and calendar reporting.

### `DELETE /transactions/{id}/`
Soft-deletes by setting `deleted_at`; response `204`. Standard reports exclude it.

## 6. Budgets and allocations

### `GET /budgets/`
Filters: `scope=MONTHLY_OVERALL|EVENT`, `year`, `month`, `book_id`.

### `POST /budgets/`
Monthly request:
```json
{
  "scope": "MONTHLY_OVERALL",
  "year": 2026,
  "month": 10,
  "total_limit": "20000.00"
}
```
Event request:
```json
{
  "scope": "EVENT",
  "book_id": "bdf73d4c-7a3d-4a6e-8c11-5e4f71c29350",
  "total_limit": "10000.00"
}
```
One monthly overall budget per user/month; one event budget per event book. Limits are non-negative.

### `GET /budgets/{id}/`
Returns budget definition, allocations, calculated spending, remaining amount, and utilization. Derived values are computed from active expense transactions, not stored as authoritative mutable totals.

### `PATCH /budgets/{id}/`
Updates `total_limit` and allowed period metadata, subject to uniqueness and allocation constraints. Existing spending may exceed a newly reduced budget; return the resulting over-budget status.

### `PUT /budgets/{id}/allocations/`
Atomically replaces all category allocations:
```json
{
  "allocations": [
    { "category_id": "8d5c7d0c-3a1d-4c4e-a52e-9c4a1b0d2d01", "amount": "5000.00" },
    { "category_id": "c7f0e7b5-aab1-4d82-8d45-54c9fcb2d3c1", "amount": "1500.00" }
  ]
}
```
All categories must be active expense categories owned by the user. Each category appears at most once. Amounts must be non-negative. Sum must not exceed `total_limit`. Lock the parent budget row and perform replacement in a database transaction to avoid concurrent oversubscription.

## 7. Reports

### `GET /reports/monthly/?year=2026&month=10`
Combined monthly dashboard. Required response:
```json
{
  "period": { "year": 2026, "month": 10 },
  "currency": "INR",
  "income_total": "40000.00",
  "expense_total": "17000.00",
  "net_cash_flow": "23000.00",
  "book_type_breakdown": [
    { "book_type": "MONTHLY", "income": "40000.00", "expenses": "12000.00" },
    { "book_type": "EVENT", "income": "0.00", "expenses": "5000.00" },
    { "book_type": "GENERAL", "income": "0.00", "expenses": "0.00" }
  ],
  "category_breakdown": [],
  "budget": {
    "total_limit": "20000.00",
    "spent": "17000.00",
    "remaining": "3000.00",
    "utilization_percent": "85.00",
    "status": "ON_TRACK"
  },
  "recent_transactions": []
}
```
All totals are examples. In production, compute totals from active transactions by transaction date and owner. Every transaction is counted once. Book-type breakdowns group transactions by the type of their owning book. The overall monthly budget includes expenses across all book types. Budget statuses: `NOT_SET`, `ON_TRACK`, `NEAR_LIMIT`, `OVER_BUDGET`, or `UNBUDGETED_SPENDING`. Define threshold for `NEAR_LIMIT` in the frontend/backend shared contract; baseline recommendation is >=80% and <=100%.

### `GET /reports/books/{id}/`
Book-scoped totals and category breakdown, excluding soft-deleted entries.

### `GET /reports/budget-utilization/?year=2026&month=10`
Returns overall monthly budget and category allocation progress.

## 8. CSV export

### `GET /exports/transactions.csv`
Accepts the transaction filters (`book_id`, `type`, `category_id`, `payment_method_id`, `date_from`, `date_to`, `search`). Returns `text/csv; charset=utf-8` with a safe filename.

- Export only the authenticated user's active records.
- Apply the same filter semantics as the list endpoint.
- Escape CSV formula-injection risks for user-controlled cells beginning with `=`, `+`, `-`, or `@`.
- Include amount as a decimal string and dates in ISO format.
- Do not export other users' data or soft-deleted records.

## 9. Cross-cutting rules

- Book totals are book-scoped; combined month totals are transaction-date-scoped across books.
- Event expenses can count against both an event budget and a monthly overall budget, because these are distinct budget scopes; the underlying transaction remains singular.
- Opening balances are not income.
- Transfers are not modeled as income/expense in V1.
- Use database transactions for multi-step mutations.
- Use deterministic ordering and pagination.
- Add API tests for success, validation errors, cross-user access, boundary dates, and concurrent monthly-book creation.
