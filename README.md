# Khaata

**Track it. Split it. Stay on budget.**

Khaata is a mobile-first personal finance and event expense tracker. V1 focuses on personal monthly books, event/general books, income and expenses, budget tracking, combined monthly reporting, search, and CSV export.

## Project status

- Step 1 — SRS/MVP/business rules: approved.
- Step 2 — architecture/database baseline: finalized.
- Step 3 — Clean Fintech UI/UX specification: approved.
- Step 4 — API contract and repository governance: prepared.
- Implementation: **not started**.

## Technology baseline

- Frontend: React + TypeScript + Vite.
- Styling: Tailwind CSS with documented design tokens.
- Backend: Python + Django + Django REST Framework.
- Database: PostgreSQL.
- API: JSON REST under `/api/v1/`.
- V1 deployment target: free-tier friendly hosting, subject to current provider limits.
- V1 architecture: modular monolith; no microservices, Redis, Celery, or Kubernetes.

## Start here

1. Read `AGENTS.md` before asking an agent to modify code.
2. Read `docs/development/PROJECT_STATUS.md` and `docs/development/HANDOFF.md`.
3. Read `docs/api/API_CONTRACT.md` and `docs/api/openapi.yaml`.
4. Read the approved architecture and UI/UX docs under `docs/`.
5. Select one task from `docs/development/IMPLEMENTATION_BACKLOG.md`.
6. Create a feature branch and work only on that task.
7. Update the task status, tests, changelog, and checkpoint before handing off.

## Repository layout

```text
.
├── AGENTS.md
├── CLAUDE.md
├── CODEX.md
├── README.md
├── CHANGELOG.md
├── .env.example
├── .gitignore
├── .github/
│   ├── pull_request_template.md
│   └── ISSUE_TEMPLATE/
├── docs/
│   ├── api/
│   ├── architecture/
│   ├── decisions/
│   ├── development/
│   └── ui-ux/
├── frontend/       # created during implementation
└── backend/        # created during implementation
```

## Important financial invariants

- Monetary amounts use decimal values, never binary floating-point.
- Every transaction belongs to exactly one book.
- Combined monthly reports aggregate eligible active transactions by transaction date across all the user's books and count each transaction once.
- Book totals are scoped to that book only.
- Monthly budgets include eligible expenses across all book types; event budgets include expenses from that event book.
- Overspending is allowed and warned about, not blocked.
- All user-owned objects must be scoped to the authenticated user server-side.
- Transaction deletion is soft deletion in V1.
