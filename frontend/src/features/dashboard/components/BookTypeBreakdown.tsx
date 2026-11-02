/**
 * BookTypeBreakdown — income and expenses per book type, exactly as returned by
 * GET /reports/monthly/ (always MONTHLY, EVENT, GENERAL).  Rendered as a table
 * so it stays readable at 320 px and is natively accessible.
 */

import { formatMoney } from '@/features/books/utils'
import type { BookType, BookTypeBreakdownItem } from '@/types'

const LABEL: Record<BookType, string> = {
  MONTHLY: 'Monthly books',
  EVENT: 'Event books',
  GENERAL: 'General books',
}

export default function BookTypeBreakdown({ rows }: { rows: BookTypeBreakdownItem[] }) {
  return (
    <section
      aria-labelledby="book-type-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="book-type-heading" className="text-base font-semibold text-text-primary">
        Breakdown by book type
      </h2>
      <p className="mt-1 text-caption text-text-secondary">
        Every transaction is counted once, by its date, in the type of book that holds it.
      </p>
      <table className="mt-3 w-full text-sm">
        <caption className="sr-only">Income and expenses by book type for the selected month</caption>
        <thead>
          <tr className="text-left text-caption text-text-secondary">
            <th scope="col" className="py-2 pr-2 font-medium">
              Book type
            </th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">
              Income
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Expenses
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.book_type}
              className="border-t border-border"
              data-testid={`book-type-${row.book_type}`}
            >
              <th scope="row" className="py-2 pr-2 text-left font-medium text-text-primary">
                {LABEL[row.book_type]}
              </th>
              <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(row.income)}</td>
              <td className="py-2 text-right tabular-nums">{formatMoney(row.expenses)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
