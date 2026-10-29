# Khaata — UI/UX Specification

- ID: KH-UX-001
- Version: 1.0 proposed for approval
- Date: 2026-10-27
- Dependencies: approved SRS v1.0; Step 2 KH-SAD-001 and KH-DBD-001
- Product: private, mobile-first React web app; V1 only

## 1. Experience goals
1. Record an expense with amount and type using minimal taps; defaults provide current date and selected book.
2. See *combined monthly* income, expenses, net cash flow and monthly budget; separately see monthly/event/general spending, all by transaction date.
3. Preserve distinction between book totals and monthly overall totals; event expenses appear once in monthly combined totals and may consume both event and monthly budget.
4. Make overspending visible without blocking a save; keep all currency amounts formatted INR and never imply balances reconcile bank accounts.
5. Support 320px-wide mobile browsers through desktop; accessible controls and clear empty/error states.

## 2. Information architecture
Authenticated: Home, Books, Add transaction, Budgets, Reports, Profile/Settings. Books > Book detail > Transaction detail/edit. Budgets > Monthly overall budget / Event budget > Allocation editor. Reports > Month / Book > CSV export. Unauthenticated: Login, Register. No shared expenses, split settlements, receipt uploads, transfers, offline editing or dark mode in V1.

## 3. Navigation
- Mobile: persistent bottom navigation (Home, Books, Add, Budgets, Reports); Add is prominent; 5 destinations; profile via top-right avatar. Safe-area padding and keyboard-aware positioning; avoid covering inputs.
- Desktop >=1024px: left sidebar; top header with month selector, search where relevant, user menu; main content max width 1200px.
- Tablet 768–1023px: condensed sidebar or bottom navigation based on available width; no hidden core actions.
- Back navigation retains book, search, month, filters and scroll when practical; deep links directly open permitted resources.
- Unsaved edits: confirmation before leaving; saving disables duplicate submission; optimistic financial totals are avoided until server confirms.

## 4. Screen inventory and requirements
| ID | Route | Primary content | Main actions | States |
|---|---|---|---|---|
| UX-01 | /login | Email, password | Log in; register link | invalid credentials, loading, offline |
| UX-02 | /register | Display name, email, password, confirm | Register | validation, duplicate email, loading |
| UX-03 | / | Selected month, combined KPIs, overall budget, book-type breakdown, category chart, recent entries | Change month, add transaction, open reports/books | no data, no budget, loading, error |
| UX-04 | /books | Monthly, event, general sections; search; archive filter | Open month, create event/general | no books, no search results |
| UX-05 | /books/:id | Book-specific income, expense, net, entries; event budget if present | Add, edit book, archive/restore, filter | archived read-only, empty, error |
| UX-06 | /transactions/new | Amount, income/expense, book, date, optional category/method/notes | Save, cancel | validation, submit failure |
| UX-07 | /transactions/:id/edit | Existing transaction form | Save, soft-delete with confirmation | moved-month notice, archived read-only |
| UX-08 | /budgets | Month overall budget, category progress; event budgets | Choose month, create/edit budget | no budget, over budget |
| UX-09 | /budgets/:id | Overall limit, allocations, remaining/unallocated, category spending | Edit allocations, save | over-allocation error, zero budget |
| UX-10 | /reports | Month/date filters, combined totals, book-type and category breakdown, CSV | Filter, export | no results, export error |
| UX-11 | /settings | Display name, timezone (initial Asia/Kolkata), sign out, export guidance | Update settings, logout | saved/error |

## 5. Detailed interactions
### Home
Default selected calendar month is current month in user timezone. Fetch combined report by year/month, not by a single book ID. KPI: income, expenses, net cash flow (not accounting profit). Show budget utilization (or 'Set a budget'), expense breakdown by MONTHLY/EVENT/GENERAL, recent activity with source book label. Use separate section 'Monthly book' linking to that book. The book-type expense breakdown must sum exactly to combined expenses. Empty combined month shows zeros and 'Add your first entry'.

### Books
Monthly section sorted descending; on selecting a month, call POST /books/monthly/{year}/{month}/ensure/ before opening details; no mutation on ordinary GET. Events/general books manually created. Archive event/general only; archived book visible via filter and read-only until restored. Search names case-insensitively; don't imply transactions are deleted when a book is archived.

### Quick add
On tap Add, show full-screen mobile route or accessible sheet with persistent save; desktop can use centered dialog or route. Required visible fields: amount, Income/Expense toggle; book defaults to current month when no book context, date defaults to today in timezone. Date and book remain editable. Optional category/method/description collapsed under 'More details' but easy to reach. Money input accepts up to two decimals and >0; display server errors inline. If user changes date while using a MONTHLY book, target month must be reconciled before save (prefer select/ensure matching month; never silently submit mismatched book). Confirm server success before showing updated budget. Show non-blocking over-budget warning with remaining negative and link to budget; never reject solely for overspend.

### Budget editor
Monthly overall budgets consume expense transactions from every owned book dated in month. Event budget consumes expenses inside event book across dates. Uncategorised spending consumes overall limit but no category allocation. Display overall allocation total, unallocated amount, spent, remaining, utilization, category progress and warning states. Prevent allocations total > overall limit, reject negative values, handle zero limit without division by zero. Editing budget never edits transactions. Use clear labels 'Overall monthly' vs 'Event budget'.

### Reports
Default month = current. Filter date range/book/category/type/payment method as supported by final API contract. Combined monthly reports are by transaction date and include archived books. CSV export shows scope and filter summary, respects authorization; don't promise a PDF in V1.

## 6. Global states and copy
- Loading: skeleton cards; form buttons show pending; no misleading zero KPIs while loading.
- Empty: explanation and relevant CTA ('Add expense', 'Create event book', 'Set budget').
- Error: concise explanation and Retry; preserve unsaved input where possible.
- Offline: 'You're offline. Changes can't be saved right now.' No offline sync promise in V1.
- Archived: visible banner 'Archived book — read only'; Restore CTA when allowed.
- Over budget: '₹X over budget' + percentage; never show remaining as a positive number.
- Success: nonblocking toast with accessible announcement.
- Deletion: confirmation names entry and amount; soft delete, excluded from reports.
- No uncategorized allocation: 'Uncategorised' shown as distinct reporting bucket.

## 7. Accessibility and internationalization
Semantic headings/landmarks, labels on every input, visible focus, keyboard support for dialogs and date picker, aria-live status updates, no color-only budget statuses, contrast target WCAG AA, minimum 44x44 CSS px touch targets, reduced-motion support. Dates display DD MMM YYYY, with explicit selected month and user timezone; use en-IN number formatting, ₹ and two decimals for transaction details. Never use floating point for money calculations in frontend; render server-provided decimal strings.

## 8. V1 boundaries and implementation dependencies
Do not add shared member UI, Splitwise screens, transfers, recurring entries, receipt uploads, notifications, PWA offline write behavior, biometric lock, PDF export or dark theme. Finalize API contracts before wiring forms; test cookie/CSRF behavior on chosen frontend/backend deployment domains. Financial totals must come from server. Build accessible components using Tailwind + shadcn/ui patterns; TanStack Query manages server state; React Hook Form + Zod for input validation.
