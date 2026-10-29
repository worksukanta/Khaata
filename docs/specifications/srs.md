**Software Requirements Specification — SRS v1.0**

DOCUMENT CONTROL

| Document ID | KH-SRS-001 |
| --- | --- |
| Version | 1.0 — proposed baseline |
| Date | 26 October 2026 |
| Target release | V1 MVP |
| Primary platform | Responsive web |

**Functional requirements**

| **ID** | **Module** | **Requirements** |
| --- | --- | --- |
| FR-01 | Authentication | Register, log in, log out, and access only authorized data |
| FR-02 | Monthly books | Automatically create or retrieve a monthly book for a requested month |
| FR-03 | Custom books | Create, edit, archive, and view event/general books |
| FR-04 | Categories | Use predefined and custom income/expense categories |
| FR-05 | Transactions | Create, view, edit, and soft-delete financial entries |
| FR-06 | Payment methods | Classify entries as cash, UPI, bank, card, or other |
| FR-07 | Budget planning | Define monthly or event budgets and category allocations |
| FR-08 | Budget monitoring | Calculate spent, remaining, and exceeded allocations |
| FR-09 | Dashboard | Display financial summaries and spending trends |
| FR-10 | Search | Search and filter books and transactions |
| FR-11 | Reports | Show date-range, book-wise, and category-wise summaries |
| FR-12 | Data ownership | Prevent users from accessing other users' private records |
| FR-13 | Data portability | Export transactions as CSV before production use |

**Non-functional requirements**

| **Area** | **Requirement** |
| --- | --- |
| Usability | Mobile-first layout; quick expense entry with minimal required fields |
| Performance | Common API reads should target under 500 ms server processing time under normal load, excluding free-host cold starts |
| Security | HTTPS in production, secure password hashing, validated inputs, object-level authorization |
| Accuracy | Exact decimal money handling, consistent totals, predictable rounding |
| Reliability | Database transactions for multi-record operations; recoverable backups |
| Maintainability | Modular Django apps, typed React code, documented API contracts |
| Accessibility | Keyboard-operable controls, labeled inputs, adequate contrast |
| Compatibility | Current major mobile browsers and modern desktop browsers |
| Testing | Automated tests for financial calculations, permissions, and core APIs |

Performance targets are engineering goals, not guarantees of free-tier infrastructure.