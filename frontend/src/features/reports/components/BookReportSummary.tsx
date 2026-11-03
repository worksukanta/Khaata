/**
 * BookReportSummary — book-scoped totals from GET /reports/books/{id}/.
 *
 * Covers every date of one book (archived books remain reportable).  All
 * figures, including `closing_balance` and the event budget, are rendered as
 * returned by the server.  Opening balances are not income.
 */

import { Link } from 'react-router-dom'
import { formatMoney } from '@/features/books/utils'
import BudgetProgress from '@/features/budgets/components/BudgetProgress'
import { isNegativeMoney } from '@/features/budgets/utils'
import CategoryBreakdown from '@/features/dashboard/components/CategoryBreakdown'
import KpiCard from '@/features/dashboard/components/KpiCard'
import KpiRow from '@/features/dashboard/components/KpiRow'
import type { BookReport, BookType } from '@/types'

const TYPE_LABEL: Record<BookType, string> = {
  MONTHLY: 'Monthly book',
  EVENT: 'Event book',
  GENERAL: 'General book',
}

export default function BookReportSummary({ report }: { report: BookReport }) {
  const { book, budget } = report
  return (
    <div className="space-y-6" data-testid="book-report">
      <section aria-labelledby="book-report-heading" className="space-y-1">
        <h2
          id="book-report-heading"
          className="break-words text-lg font-semibold text-text-primary"
        >
          {book.name}
        </h2>
        <p className="text-sm text-text-secondary">
          {TYPE_LABEL[book.type]} · totals cover every date in this book
          {book.is_archived && ' · Archived book — read only'}
        </p>
        <Link
          to={`/books/${book.id}`}
          className="inline-flex min-h-touch items-center text-sm font-medium text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-700"
        >
          Open book
        </Link>
      </section>

      <section aria-label="Book totals" className="space-y-3">
        <KpiRow
          income={report.income_total}
          expenses={report.expense_total}
          net={report.net_cash_flow}
        />
        <KpiCard
          label="Closing balance"
          value={formatMoney(report.closing_balance)}
          tone={isNegativeMoney(report.closing_balance) ? 'negative' : 'default'}
          note="Opening balance + income − expenses (opening balance is not income)"
          testId="kpi-closing"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <CategoryBreakdown
          rows={report.category_breakdown}
          expenseTotal={report.expense_total}
          emptyText="No expenses recorded for this book."
        />
        {budget && (
          <section
            aria-labelledby="book-budget-heading"
            className="rounded-card border border-border bg-surface p-4"
          >
            <h2 id="book-budget-heading" className="text-base font-semibold text-text-primary">
              Event budget
            </h2>
            <div className="mt-3">
              <BudgetProgress
                label="Event budget"
                limit={budget.total_limit}
                spent={budget.spent}
                remaining={budget.remaining}
                utilizationPercent={budget.utilization_percent}
                status={budget.status}
              />
              <Link
                to={`/budgets/${budget.id}`}
                className="mt-3 inline-flex min-h-touch items-center text-sm font-medium text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-700"
              >
                View budget details
              </Link>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
