/**
 * CategoryBreakdown — expense totals per category (UI-03 "category chart").
 *
 * No chart dependency is installed and none is required: each row shows the
 * category name and server-provided total as text, with a CSS bar as a purely
 * visual aid (hidden from assistive technology).  The list is the accessible
 * alternative demanded by DESIGN_SYSTEM.md ("charts have textual summary").
 * Order is the server's (largest first); "Uncategorised" is a distinct bucket.
 */

import { formatMoney } from '@/features/books/utils'
import type { CategoryBreakdownItem } from '@/types'
import { barPercent } from '@/features/budgets/utils'

interface CategoryBreakdownProps {
  rows: CategoryBreakdownItem[]
  /** Combined expense total; used only to scale the bars. */
  expenseTotal: string
  /** Shown when there are no expenses (defaults to the monthly wording). */
  emptyText?: string
}

export default function CategoryBreakdown({
  rows,
  expenseTotal,
  emptyText = 'No expenses recorded for this month.',
}: CategoryBreakdownProps) {
  return (
    <section
      aria-labelledby="category-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="category-heading" className="text-base font-semibold text-text-primary">
        Spending by category
      </h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <li
              key={row.category_id ?? 'uncategorised'}
              data-testid="category-row"
              className="min-w-0"
            >
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span
                  className={`min-w-0 break-words ${
                    row.category_id === null
                      ? 'italic text-text-secondary'
                      : 'font-medium text-text-primary'
                  }`}
                >
                  {row.category_name}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-text-primary">
                  {formatMoney(row.total)}
                </span>
              </div>
              <div aria-hidden="true" className="mt-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${barPercent(row.total, expenseTotal)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
