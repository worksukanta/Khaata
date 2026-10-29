## Business Rules Specification

These are the most important rules the coding agents must follow.

### BR-01 — Monthly book creation

- One monthly book exists per user, year, and month.
- It is created on first access or when the first transaction is entered for that month.
- The system must not create duplicates, even under concurrent requests.
- Book titles follow `October 2026`, `November 2026`, etc.
- The calendar month follows the user's configured timezone, initially `Asia/Kolkata`.
- A transaction dated in another month belongs to that transaction's month, not necessarily the current month.

### BR-02 — Event and monthly spending

A transaction belongs to one book only.

For V1, an event transaction dated in October appears in the October overall spending report, even though it is stored in the Durga Puja event book.

The October monthly book itself contains only transactions entered directly into that book.

This distinction is essential:

Book totals = transactions inside that book.

Monthly overall totals = qualifying transactions dated in that month across the user's books.

The dashboard must label these clearly, and a transaction must only contribute once to a given aggregate.

### BR-03 — Transaction behavior

- Amount must be greater than zero.
- Store amounts as `Decimal(14,2)` or equivalent fixed-precision database values.
- Transaction types for initial implementation: `INCOME` and `EXPENSE`.
- Required fields: amount, type, transaction date, and book.
- Default transaction date: current local date.
- Category, payment method, and description can be optional.
- A user may edit or soft-delete their own transactions.
- Deleted transactions are excluded from active totals and reports.
- Transaction creation, editing, and deletion must update relevant budget and dashboard calculations.

Transfers are reserved in the domain design for a later release. We should not represent a bank-to-cash transfer as income or expense.

### BR-04 — Budget allocations

A budget has an overall spending limit and optional category allocations.

For example:

| Category | Allocation |
| --- | --- |
| Food | ₹5,000 |
| Gym | ₹1,500 |
| Essentials | ₹4,000 |
| Clothing | ₹3,000 |
| Travel | ₹4,000 |
| Other | ₹2,500 |
| Total | ₹20,000 |

Rules:

- Budget amounts must be non-negative.
- Category allocations must not exceed the overall limit.
- Unallocated funds are allowed.
- Spending may exceed a budget; it must be flagged, not rejected.
- The same expense must not be counted twice within a budget.
- Income does not consume spending budgets.
- Budgets can be edited without changing historical transactions.

For V1, a monthly overall budget applies to eligible expenses across all personal books during that calendar month. An event book may also have its own separate budget.

An event expense may therefore count against both its event budget and its monthly overall budget. These are separate spending targets, not duplicate transactions.

### BR-05 — Budget calculations

$$ \text{Remaining} = \text{Budget Limit} - \text{Expenses} $$

$$ \text{Utilization (\%)} = \left( \frac{\text{Expenses}}{\text{Budget Limit}} \right) \times 100 $$

A zero budget needs special handling: if spending is zero, show 0% or "Not allocated"; if spending is positive, show "Unbudgeted spending" rather than dividing by zero.

### BR-06 — Income and balance

For simple V1 bookkeeping:

$$ \text{Closing Balance} = \text{Opening Balance} + \text{Income} - \text{Expenses} $$

A monthly book may also display an optional opening balance and closing balance:

$$ \text{Net Cash Flow} = \text{Income} - \text{Expenses} $$

An opening balance is not income. It must not inflate salary or earnings reports.

For V1, closing balances will not automatically carry forward between books. This avoids accidental double counting while we have no full account-transfer model.

### BR-07 — Categories

Categories belong to a user, not globally to every user account.

- Seed sensible default categories.
- Permit custom category creation.
- Prevent deleting categories in a way that destroys historical transaction data.
- Permit category renaming.
- Maintain category type compatibility with income or expense.

### BR-08 — Data isolation and auditability

- Every book is associated with its owner.
- A user cannot retrieve, modify, or delete another user's private books or transactions.
- Financial records include `created_at`, `updated_at`, and optional `deleted_at`.
- Soft-deleted entries are excluded from standard reports.
- Record modification metadata must be maintained server-side.

A comprehensive immutable audit ledger is deferred, but basic history-preserving behavior belongs in V1.

## 5. Primary user stories and acceptance criteria

US-01 — Automatic monthly book

Must have

As a user, I want my monthly expense book created automatically so I can immediately start tracking spending.

Acceptance criteria: Opening October 2026 creates or retrieves exactly one October book. Reopening it never creates a duplicate. Historical months remain accessible.

US-02 — Quick transaction entry

Must have

As a user, I want to record an expense quickly without completing a long form.

Acceptance criteria: Selecting a book, entering ₹250, and choosing Expense saves the transaction. The relevant book total, monthly report, and budget update correctly.

US-03 — Planned budget

Must have

As a user, I want to allocate money across spending categories.

Acceptance criteria: Setting Food to ₹5,000 and recording ₹5,500 in eligible food expenses displays ₹500 overspending and 110% utilization.

US-04 — Event book

Must have

As a user, I want to create a Durga Puja book and record expenses separately from my everyday entries.

Acceptance criteria: The event shows its own totals, while its October expenses also appear once in the overall October report.

US-05 — Search and filtering

Must have

As a user, I want to find past expenses without manually scrolling through books.

Acceptance criteria: Searching for "restaurant" finds matching descriptions; filters for date, category, type, and payment mode combine correctly.

US-06 — Safe record management

Must have

As a user, I want to correct mistakes without corrupting my reports.

Acceptance criteria: Editing a transaction recalculates affected totals; soft-deleting removes it from active reports; unauthorized users cannot access it.

## 6. MVP screen specification

These are the pages we'll design in the UI/UX phase.

| Screen | Primary functionality |
| --- | --- |
| Login / Register | Account authentication |
| Home Dashboard | Monthly overview, income, expenses, budget health |
| My Books | Monthly, event, and general books |
| Book Details | Transactions, totals, filters, and actions |
| Add/Edit Transaction | Fast mobile-friendly entry |
| Budget Planner | Create and modify spending allocations |
| Budget Insights | Category progress and overspending indicators |
| Reports | Date-wise and category-wise summaries |
| Profile & Settings | Account settings, timezone, and export |

On mobile, I'd use a bottom navigation with Home, Books, Add, Budgets, and Reports. The Add action should be prominent and accessible from anywhere in the application.

## 7. Initial release acceptance checklist

V1 Definition of Done

- [ ] Registration, login, logout, and authorization work
- [ ] Monthly books are created without duplication
- [ ] Event and general books can be managed
- [ ] Income and expense CRUD works correctly
- [ ] Category and payment method tracking works
- [ ] Monthly reporting includes eligible event expenses once
- [ ] Budget allocation and overspending calculations pass tests
- [ ] Books and transactions can be searched and filtered
- [ ] Dashboard works on mobile and desktop
- [ ] CSV export and backup/recovery procedure are tested
- [ ] Backend and frontend automated tests pass
- [ ] Application is deployed and smoke-tested

This checklist will become the basis for our GitHub release milestone. These are not yet implemented features.

