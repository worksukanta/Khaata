/**
 * Books feature — UI-only types.  API types live in `@/types`.
 */

export type BooksTab = 'monthly' | 'event' | 'general'

export interface YearMonth {
  year: number
  month: number
}

/** Raw form state; all values are strings as typed by the user. */
export interface BookFormValues {
  name: string
  description: string
  start_date: string
  end_date: string
}
