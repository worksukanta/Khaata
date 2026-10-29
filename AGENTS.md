# Khaata Agent Instructions

These instructions apply to every coding agent and every task in this repository.

## 1. Source of truth

Read these before making changes:
1. `docs/development/PROJECT_STATUS.md`
2. `docs/development/HANDOFF.md`
3. `docs/api/API_CONTRACT.md` and `docs/api/openapi.yaml` for API work
4. Relevant documents in `docs/architecture/`, `docs/decisions/`, and `docs/ui-ux/`
5. `docs/development/IMPLEMENTATION_BACKLOG.md`

If documents conflict, stop and report the conflict. Do not silently choose one. Approved SRS/business rules and accepted ADRs take precedence over convenience or assumptions.

## 2. Scope discipline

- Implement only the explicitly selected task and its necessary dependencies.
- Do not add V2 features (shared expenses, settlements, UPI payments, bank integrations, offline sync, receipts, reminders) to V1.
- Do not replace the selected stack without an ADR.
- Do not add dependencies without explaining why they are needed.
- Do not generate the entire application in one giant change.
- Do not overwrite existing work or regenerate files wholesale without first inspecting them.

## 3. Required workflow

Before coding:
1. Inspect repository status and relevant files.
2. State the task, files likely to change, assumptions, and test plan.
3. Check that the task has no unresolved dependency.
4. Create/use a dedicated feature branch if Git is available.

During work:
1. Make the smallest coherent change.
2. Follow existing conventions.
3. Add/update automated tests with behavior changes.
4. Never put secrets in code, logs, commits, examples, or screenshots.
5. Do not run destructive commands or rewrite history without explicit approval.

Before handing off:
1. Run the relevant tests, lint, type checks, and migrations where applicable.
2. Report exact commands and results; never claim a check passed if it was not run.
3. Update `docs/development/IMPLEMENTATION_BACKLOG.md`.
4. Update `docs/development/PROJECT_STATUS.md`, `docs/development/HANDOFF.md`, and `CHANGELOG.md` when appropriate.
5. Record decisions in `docs/decisions/` if behavior or architecture changes.
6. Summarize changed files, known issues, next task, and current Git branch/commit.

## 4. Architecture rules

- Backend: Django REST Framework modular monolith; PostgreSQL in production.
- Frontend: React + TypeScript + Vite; mobile-first responsive UI.
- API prefix: `/api/v1/`; JSON request/response unless explicitly documented otherwise.
- Use Django custom user model from the first migration.
- Use UUID primary keys for domain entities.
- Use `DecimalField(max_digits=14, decimal_places=2)` for money.
- Use explicit service functions for multi-step financial operations.
- Use database constraints for invariants where possible, plus atomic service validation for cross-row rules.
- Do not store mutable derived balances or budget-spent totals as authoritative values.
- Do not rely on frontend checks for security or business rules.

## 5. Financial invariants

- One monthly book per user/year/month, enforced by a database constraint.
- Monthly books are ensured on demand, idempotently.
- Every transaction belongs to exactly one book.
- Monthly overall reports include eligible active transactions from all books, grouped by transaction date, counted once.
- Book reports include only that book's active transactions.
- Monthly overall budgets include eligible expenses across all books; event budgets include expenses from their event book.
- Income does not consume spending budgets.
- Overspending never blocks a valid expense.
- Soft-deleted transactions are excluded from active totals and reports.
- Opening balances are not income. V1 does not automatically carry closing balances into future books.
- Do not model account transfers as income or expense.

## 6. Security requirements

- Every object query and write must enforce owner scoping on the server.
- Never trust a user ID supplied by the client to establish ownership.
- Validate that books, categories, payment methods, and budgets belong to the authenticated user.
- Configure CSRF, CORS, trusted origins, secure cookies, and HTTPS appropriately.
- Do not store auth tokens in browser local storage.
- Avoid leaking the existence of another user's resources; return 404 for inaccessible objects where specified.
- Do not log passwords, session identifiers, secrets, or financial payloads unnecessarily.

## 7. Frontend rules

- Follow `docs/ui-ux/DESIGN_SYSTEM.md` and `docs/ui-ux/UI_UX_SPECIFICATION.md`.
- Mobile-first, accessible controls, keyboard support, visible focus, labeled form fields.
- Provide loading, empty, error, success, and offline/network-failure states as applicable.
- Preserve unsaved form input when a recoverable request fails.
- Keep API calls in a shared typed client layer; do not scatter raw fetch calls through components.
- Use the combined monthly dashboard with clearly labeled book-type breakdowns.

## 8. Agent response format

End each task with:
- **Status:** complete / partial / blocked
- **Files changed**
- **Tests run and results**
- **Decisions or assumptions**
- **Known issues**
- **Next recommended backlog ID**
- **Checkpoint update:** what another agent needs to continue without repeating work
