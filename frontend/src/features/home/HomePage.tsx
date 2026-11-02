/**
 * HomePage — combined monthly dashboard (UX-03, `/`).
 *
 * Data comes exclusively from GET /reports/monthly/?year=&month= (plus the books
 * list to label recent entries).  All totals, budget figures and statuses are
 * rendered as the server returned them; nothing is recalculated here.
 *
 * Selected month lives in the URL (`?year=&month=`), defaulting to the current
 * month in the user's timezone.  No misleading zero KPIs are shown while loading.
 */

import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/StateViews'
import { primaryButton, secondaryButton } from '@/components/ui/styles'
import { useAuth } from '@/features/auth/AuthContext'
import MonthNavigator from '@/features/books/components/MonthNavigator'
import { useAllBooks } from '@/features/books/hooks/useBooks'
import type { YearMonth } from '@/features/books/types'
import { formatMoney, getCurrentYearMonth, monthLabel, parseYearMonth } from '@/features/books/utils'
import { isNegativeMoney } from '@/features/budgets/utils'
import { getApiErrorMessage } from '@/services/api/errors'
import BookTypeBreakdown from '@/features/dashboard/components/BookTypeBreakdown'
import CategoryBreakdown from '@/features/dashboard/components/CategoryBreakdown'
import DashboardBudgetCard from '@/features/dashboard/components/DashboardBudgetCard'
import KpiCard from '@/features/dashboard/components/KpiCard'
import RecentTransactions from '@/features/dashboard/components/RecentTransactions'
import { useMonthlyReport } from '@/features/dashboard/hooks/useReports'

export default function HomePage() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const current = useMemo(() => getCurrentYearMonth(user?.timezone), [user?.timezone])
  const selected: YearMonth =
    parseYearMonth(searchParams.get('year'), searchParams.get('month')) ?? current

  const report = useMonthlyReport(selected.year, selected.month)
  // Labels for the recent-entry rows only; the report itself carries book_id.
  const books = useAllBooks({ ordering: '-created_at' })

  const bookNames = useMemo(
    () => new Map((books.data ?? []).map((b) => [b.id, b.name])),
    [books.data],
  )

  function selectMonth(next: YearMonth) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        if (next.year === current.year && next.month === current.month) {
          params.delete('year')
          params.delete('month')
        } else {
          params.set('year', String(next.year))
          params.set('month', String(next.month))
        }
        return params
      },
      { replace: false },
    )
  }

  const data = report.data
  const isEmptyMonth = data !== undefined && data.recent_transactions.length === 0

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
              Home
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              Combined monthly overview across all your books, by transaction date.
            </p>
          </div>
          <Link to="/transactions/new" className={primaryButton}>
            Add transaction
          </Link>
        </div>
        <MonthNavigator value={selected} current={current} onChange={selectMonth} />
      </div>

      {report.isPending && <LoadingSkeleton label={`Loading ${monthLabel(selected)}`} rows={4} />}

      {report.isError && (
        <ErrorState
          message={getApiErrorMessage(
            report.error,
            `Could not load the overview for ${monthLabel(selected)}.`,
          )}
          onRetry={() => void report.refetch()}
          retrying={report.isFetching}
        />
      )}

      {data && (
        <div
          className="space-y-6"
          aria-busy={report.isFetching}
          data-testid="dashboard-content"
        >
          <section aria-label={`${monthLabel(selected)} totals`}>
            <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
              <KpiCard
                label="Income"
                value={formatMoney(data.income_total)}
                testId="kpi-income"
              />
              <KpiCard
                label="Expenses"
                value={formatMoney(data.expense_total)}
                testId="kpi-expenses"
              />
              <div className="min-[420px]:col-span-2 lg:col-span-1">
                <KpiCard
                  label="Net cash flow"
                  value={formatMoney(data.net_cash_flow)}
                  tone={isNegativeMoney(data.net_cash_flow) ? 'negative' : 'default'}
                  note={
                    isNegativeMoney(data.net_cash_flow)
                      ? 'Negative — expenses exceeded income'
                      : 'Income minus expenses'
                  }
                  testId="kpi-net"
                />
              </div>
            </div>
          </section>

          {isEmptyMonth && (
            <EmptyState
              title="No entries for this month"
              description="Add your first entry to see income, expenses and budget progress here."
              action={
                <Link to="/transactions/new" className={secondaryButton}>
                  Add your first entry
                </Link>
              }
            />
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <DashboardBudgetCard budget={data.budget} period={data.period} />
              <CategoryBreakdown
                rows={data.category_breakdown}
                expenseTotal={data.expense_total}
              />
            </div>
            <div className="space-y-6">
              <BookTypeBreakdown rows={data.book_type_breakdown} />
              <RecentTransactions
                transactions={data.recent_transactions}
                bookNames={bookNames}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
