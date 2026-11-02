/**
 * Budgets feature — UI-only types.  API types live in `@/types`.
 */

/** One editable row of the allocation editor; values are strings as typed. */
export interface AllocationRow {
  /** Stable React key (not sent to the API). */
  key: number
  category_id: string
  amount: string
}

export interface AllocationRowErrors {
  category?: string
  amount?: string
}

export interface AllocationServerErrors {
  /** Keyed by zero-based row index. */
  rows: Record<number, AllocationRowErrors>
  form?: string
}
