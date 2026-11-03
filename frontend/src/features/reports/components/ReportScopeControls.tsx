/**
 * ReportScopeControls — what the report covers: the book (all books or one),
 * the date scope, and — for the combined monthly view — the selected month.
 *
 * Options mirror what the backend can answer:
 *  - all books + "Selected month"  → GET /reports/monthly/ (+ month-bounded list/export)
 *  - one book  + "All dates"       → GET /reports/books/{id}/
 *  - "Custom date range" / "All dates" without a book narrow only the transaction
 *    list and CSV export (date_from / date_to), which the report endpoints do not accept.
 */

import { inputClass } from '@/components/ui/styles'
import MonthNavigator from '@/features/books/components/MonthNavigator'
import type { YearMonth } from '@/features/books/types'
import type { Book } from '@/types'
import type { DateScope } from '../types'

interface ReportScopeControlsProps {
  books: Book[]
  booksLoading: boolean
  booksFailed: boolean
  bookId: string | undefined
  period: DateScope
  selected: YearMonth
  current: YearMonth
  onBookChange: (bookId: string | undefined) => void
  onPeriodChange: (period: DateScope) => void
  onMonthChange: (month: YearMonth) => void
}

const LABEL = 'mb-1 block text-caption font-medium text-text-secondary'

export default function ReportScopeControls({
  books,
  booksLoading,
  booksFailed,
  bookId,
  period,
  selected,
  current,
  onBookChange,
  onPeriodChange,
  onMonthChange,
}: ReportScopeControlsProps) {
  const knownBook = bookId ? books.some((b) => b.id === bookId) : true

  return (
    <section aria-label="Report scope" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="report-book" className={LABEL}>
            Book
          </label>
          <select
            id="report-book"
            className={inputClass}
            value={bookId ?? ''}
            onChange={(e) => onBookChange(e.target.value || undefined)}
            aria-describedby={booksFailed ? 'report-book-error' : undefined}
          >
            <option value="">All books</option>
            {bookId && !knownBook && <option value={bookId}>Selected book</option>}
            {books.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.is_archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
          {booksLoading && (
            <p className="mt-1 text-caption text-text-secondary" role="status">
              Loading books…
            </p>
          )}
          {booksFailed && (
            <p id="report-book-error" className="mt-1 text-caption text-danger-text">
              Could not load your books. You can still report on all books.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="report-period" className={LABEL}>
            Dates
          </label>
          <select
            id="report-period"
            className={inputClass}
            value={period}
            onChange={(e) => onPeriodChange(e.target.value as DateScope)}
          >
            {!bookId && <option value="month">Selected month</option>}
            <option value="range">Custom date range</option>
            <option value="all">All dates</option>
          </select>
        </div>
      </div>

      {period === 'month' && !bookId && (
        <MonthNavigator value={selected} current={current} onChange={onMonthChange} />
      )}
    </section>
  )
}
