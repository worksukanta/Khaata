# Khaata — Screen-level Acceptance Criteria (KH-UX-005)

Each screen must satisfy global criteria: 320px viewport without horizontal page overflow, keyboard navigation, visible focus, descriptive labels, server error handling, loading and empty states, and correct ownership handling. Do not claim completion from screenshots alone; test flows.

| ID | Testable acceptance criteria |
|---|---|
| UX-01 Login | Valid login enters Home; invalid credentials show nonrevealing error; loading blocks duplicate submit; redirect returns to safe intended route. |
| UX-02 Register | Valid data creates account; duplicate email and password validation shown inline; no raw backend traceback. |
| UX-03 Home | Month change updates all KPIs; combined total equals sum of MONTHLY+EVENT+GENERAL breakdown; archived-book transactions included; event expenses counted once; no budget shows CTA; negative net clearly labeled. |
| UX-04 Books | Current month can be ensured once; search filters by name; create event/general works; archive filter shows archived books; monthly books cannot be archived. |
| UX-05 Book detail | Totals use only transactions in book; event spanning months remains one book; archived books read-only; transaction list filters and pagination work. |
| UX-06 Add | Amount+type with sensible defaults saves; invalid/zero amount blocked; optional details not required; server success updates totals; overspending displays warning but save succeeds. |
| UX-07 Edit/delete | Editing amount/category recalculates summaries; moving monthly transaction to another month updates both; deletion requires confirmation and removes entry from active reports; unsaved edits warn on exit. |
| UX-08 Budgets | Monthly overall includes eligible expenses across books by transaction date; event budgets independent; overspending text shows magnitude; zero budget avoids division by zero; unallocated spending reported. |
| UX-09 Allocations | Sum of category allocations cannot exceed total; nonnegative only; atomic save either updates all allocations or none; duplicate category rejected; failed save preserves entered values. |
| UX-10 Reports | Filter changes recompute totals; book-type breakdown reconciles to combined expenses; CSV export honors filters; no data state and export failure visible. |
| UX-11 Settings | Timezone shown and update confirmed; sign out clears authenticated UI; no sensitive data displayed after logout. |

## Cross-cutting E2E scenarios
1. Create event expense in October; verify October combined and event book totals, with one monthly contribution.
2. Event spanning October/November: each transaction appears in its date's month; event book totals span both.
3. Overspend category: save succeeds; warning says over limit and percentage >100.
4. Soft-delete an event expense: both event and monthly overall aggregates decrease exactly once.
5. Create monthly book concurrently: one resulting book, no duplicate UI cards.
6. Cross-user book ID: API returns not found; UI displays generic not-found state.
7. No connectivity during save: preserve form values, show retry, do not pretend entry was saved.
8. CSV export includes only authenticated user's eligible transactions.

## Definition of done for Step 3
Specification, navigation map, wireframes, design tokens and acceptance criteria reviewed and approved. No code, migration, deployment, or screenshot is implied by design approval.
