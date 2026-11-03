/**
 * MonthlyHistory — income, expenses and net for the selected month and the
 * months before it, from GET /reports/monthly/ (one call per month, sharing the
 * dashboard's cache).  Figures are rendered exactly as the server returned them.
 */

import { secondaryButton } from '@/components/ui/styles'
import type { YearMonth } from '@/features/books/types'
import { formatMoney, monthLabel } from '@/features/books/utils'
import { isNegativeMoney } from '@/features/budgets/utils'
import { useMonthlyHistory } from '../hooks/useMonthlyHistory'

interface MonthlyHistoryProps {
  selected: YearMonth
  onSelect: (month: YearMonth) => void
}

export default function MonthlyHistory({ selected, onSelect }: MonthlyHistoryProps) {
  const rows = useMonthlyHistory(selected)

  return (
    <section
      aria-labelledby="history-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="history-heading" className="text-base font-semibold text-text-primary">
        Recent months
      </h2>
      <p className="mt-1 text-caption text-text-secondary">
        Combined totals across all books, by transaction date.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-sm">
          <caption className="sr-only">Income, expenses and net cash flow by month</caption>
          <thead>
            <tr className="text-left text-caption text-text-secondary">
              <th scope="col" className="py-2 pr-2 font-medium">
                Month
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">
                Income
              </th>
              <th scope="col" className="py-2 pr-2 text-right font-medium">
                Expenses
              </th>
              <th scope="col" className="py-2 text-right font-medium">
                Net
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ month, query }) => {
              const isSelected = month.year === selected.year && month.month === selected.month
              const label = monthLabel(month)
              return (
                <tr
                  key={`${month.year}-${month.month}`}
                  data-testid={`history-${month.year}-${month.month}`}
                  aria-current={isSelected ? 'true' : undefined}
                  className={`border-t border-border ${isSelected ? 'bg-brand-50' : ''}`}
                >
                  <th scope="row" className="py-2 pr-2 text-left font-medium text-text-primary">
                    {isSelected ? (
                      <span>
                        {label} <span className="text-caption text-text-secondary">(selected)</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelect(month)}
                        aria-label={`Show ${label}`}
                        className="min-h-touch text-left font-medium text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-700"
                      >
                        {label}
                      </button>
                    )}
                  </th>
                  {query.data ? (
                    <>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {formatMoney(query.data.income_total)}
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        {formatMoney(query.data.expense_total)}
                      </td>
                      <td
                        className={`py-2 text-right tabular-nums ${
                          isNegativeMoney(query.data.net_cash_flow) ? 'text-danger-text' : ''
                        }`}
                      >
                        {formatMoney(query.data.net_cash_flow)}
                      </td>
                    </>
                  ) : (
                    <td colSpan={3} className="py-2 text-right text-text-secondary">
                      {query.isError ? (
                        <button
                          type="button"
                          className={secondaryButton}
                          onClick={() => void query.refetch()}
                          aria-label={`Retry ${label}`}
                        >
                          Could not load — retry
                        </button>
                      ) : (
                        <span role="status">Loading…</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
