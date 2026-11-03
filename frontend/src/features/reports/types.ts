/**
 * Reports feature — UI-only types.  API types live in `@/types`.
 */

import type { TransactionFilterState } from '@/features/transactions/types'

/**
 * Which dates the transaction list and CSV export cover when no single book is
 * selected (the monthly overview scope):
 *  - `month`  the selected calendar month (default);
 *  - `range`  an explicit From/To range chosen by the user;
 *  - `all`    every date (global search across all books).
 */
export type DateScope = 'month' | 'range' | 'all'

/** Everything the Reports page keeps in the URL query string. */
export interface ReportUrlState {
  /** Explicit year/month, or undefined for "current month". */
  year?: number
  month?: number
  /** Selected book id (single-book scope), if any. */
  bookId?: string
  /** True when `?book=` was present but is not a valid UUID. */
  bookInvalid: boolean
  period: DateScope
  filters: TransactionFilterState
}
