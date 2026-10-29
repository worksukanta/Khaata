## MVP scope — what exactly ships

## V1 release boundary

This is the minimum functionality required before calling Khaata usable.

| Account management | Register, login, logout, protected routes |
| --- | --- |
| Monthly books | Auto-create, browse historical months, navigate months |
| Event books | Create, rename, archive, track spending |
| Transactions | Income, expense, payment mode, categories, notes, date |
| Budgeting | Total budget, category allocations, utilization and variance |
| Dashboard | Income, expense, net cash flow, category chart, recent entries |
| Search | Book names and transaction filters |
| Export | CSV for user-controlled data portability |

### Explicitly out of V1

Shared expense splitting, friend invitations, settlements, bank account integration, UPI payments, receipt uploads, recurring transactions, offline sync, push notifications, biometric lock, and PDF exports.

One adjustment from our initial plan: I recommend CSV export as part of V1, rather than postponing all export functionality. This is important because you'll store personal financial data on infrastructure with free-tier limitations.