/**
 * ReportsPage — UX-10 (`/reports`).
 *
 * Scopes (all state lives in the URL so back/forward, refresh and deep links work):
 *  - All books + "Selected month"  → GET /reports/monthly/?year=&month= (combined, by
 *    transaction date) with recent-month history from the same endpoint.
 *  - One book (`bookId`)           → GET /reports/books/{id}/ (every date of that book).
 *  - "Custom date range" / "All dates" without a book narrow only the transaction list
 *    and CSV export: the report endpoints accept no date range, so no totals are shown
 *    for those scopes and none are computed in the browser.
 *
 * The transaction list (GET /transactions/) and the CSV export
 * (GET /exports/transactions.csv) are driven by the SAME filter parameters, derived in
 * one place (`toExportParams` / `toListParams`), so the export always matches the list.
 * Totals are rendered exactly as the server returned them.
 */

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/StateViews'
import { primaryButton, secondaryButton } from '@/components/ui/styles'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthContext'
import Pagination from '@/features/books/components/Pagination'
import { useAllBooks, useDebouncedValue } from '@/features/books/hooks/useBooks'
import type { YearMonth } from '@/features/books/types'
import { formatDate, getCurrentYearMonth, monthLabel } from '@/features/books/utils'
import BookTypeBreakdown from '@/features/dashboard/components/BookTypeBreakdown'
import CategoryBreakdown from '@/features/dashboard/components/CategoryBreakdown'
import DashboardBudgetCard from '@/features/dashboard/components/DashboardBudgetCard'
import KpiRow from '@/features/dashboard/components/KpiRow'
import { useBookReport, useMonthlyReport } from '@/features/dashboard/hooks/useReports'
import TransactionFilters from '@/features/transactions/components/TransactionFilters'
import TransactionRow from '@/features/transactions/components/TransactionRow'
import { useCategoriesList } from '@/features/transactions/hooks/useCategories'
import { usePaymentMethodsList } from '@/features/transactions/hooks/usePaymentMethods'
import { useTransactionsList } from '@/features/transactions/hooks/useTransactions'
import type { TransactionFilterState } from '@/features/transactions/types'
import { getApiErrorCode, getApiErrorMessage } from '@/services/api/errors'
import BookReportSummary from './components/BookReportSummary'
import CsvExportAction from './components/CsvExportAction'
import MonthlyHistory from './components/MonthlyHistory'
import ReportScopeControls from './components/ReportScopeControls'
import { useCsvExport } from './hooks/useCsvExport'
import type { DateScope, ReportUrlState } from './types'
import {
  DEFAULT_ORDERING,
  hasActiveFilters,
  isRangeInverted,
  parseReportUrl,
  serializeReportUrl,
  summarizeExport,
  toExportParams,
  toListParams,
} from './utils'

const CLEARED_FILTERS: TransactionFilterState = {
  type: undefined,
  category_id: undefined,
  payment_method_id: undefined,
  date_from: undefined,
  date_to: undefined,
  search: '',
  ordering: DEFAULT_ORDERING,
  page: 1,
}

export default function ReportsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const state = useMemo(() => parseReportUrl(searchParams), [searchParams])

  const current = useMemo(() => getCurrentYearMonth(user?.timezone), [user?.timezone])
  const selected = useMemo<YearMonth>(
    () =>
      state.year !== undefined && state.month !== undefined
        ? { year: state.year, month: state.month }
        : current,
    [state.year, state.month, current],
  )

  const csvExport = useCsvExport()
  const [lastExport, setLastExport] = useState<string | undefined>()
  const [showFilters, setShowFilters] = useState(() => hasActiveFilters(state))

  const books = useAllBooks({ ordering: 'name' })
  const categories = useCategoriesList()
  const paymentMethods = usePaymentMethodsList()

  const debouncedSearch = useDebouncedValue(state.filters.search, 300)

  // --- URL updates ----------------------------------------------------------

  function update(next: ReportUrlState, options: { replace?: boolean } = {}) {
    csvExport.reset()
    setLastExport(undefined)
    setSearchParams(serializeReportUrl(next), { replace: options.replace ?? false })
  }

  function selectMonth(month: YearMonth) {
    const isCurrent = month.year === current.year && month.month === current.month
    update({
      ...state,
      year: isCurrent ? undefined : month.year,
      month: isCurrent ? undefined : month.month,
      filters: { ...state.filters, page: 1 },
    })
  }

  function selectBook(bookId: string | undefined) {
    update({
      ...state,
      bookId,
      bookInvalid: false,
      period: bookId ? 'all' : 'month',
      filters: { ...state.filters, page: 1 },
    })
  }

  function selectPeriod(period: DateScope) {
    update({ ...state, period, filters: { ...state.filters, page: 1 } })
  }

  function changeFilters(filters: TransactionFilterState) {
    update({ ...state, filters }, { replace: true })
  }

  function clearFilters() {
    update(
      {
        ...state,
        filters: {
          ...CLEARED_FILTERS,
          // Keep the chosen custom range: it is part of the scope, not an extra filter.
          date_from: state.period === 'range' ? state.filters.date_from : undefined,
          date_to: state.period === 'range' ? state.filters.date_to : undefined,
        },
      },
      { replace: true },
    )
  }

  // --- Data -----------------------------------------------------------------

  const inverted = isRangeInverted(state)
  const bookMode = Boolean(state.bookId)
  const monthMode = !bookMode && state.period === 'month'

  const bookReport = useBookReport(state.bookId)
  const monthlyReport = useMonthlyReport(selected.year, selected.month, { enabled: monthMode })

  const bookNotFound =
    state.bookInvalid ||
    (bookMode && bookReport.isError && getApiErrorCode(bookReport.error) === 'not_found')

  // Wait for the book report so an inaccessible book never triggers a list request.
  const listEnabled = !inverted && !bookNotFound && !(bookMode && bookReport.isPending)
  const listParams = useMemo(
    () => toListParams(state, selected, debouncedSearch),
    [state, selected, debouncedSearch],
  )
  const exportParams = useMemo(
    () => toExportParams(state, selected, debouncedSearch),
    [state, selected, debouncedSearch],
  )
  const transactions = useTransactionsList(listParams, { enabled: listEnabled })

  const bookList = useMemo(() => books.data ?? [], [books.data])
  const bookNames = useMemo(() => new Map(bookList.map((b) => [b.id, b.name])), [bookList])

  const summary = summarizeExport(state, {
    bookName: state.bookId ? bookNames.get(state.bookId) : undefined,
    categoryName: categories.data?.results.find((c) => c.id === state.filters.category_id)?.name,
    paymentMethodName: paymentMethods.data?.results.find(
      (p) => p.id === state.filters.payment_method_id,
    )?.name,
    monthLabel: monthLabel(selected),
    formatDate,
  })
  function handleExport() {
    csvExport.mutate(exportParams, {
      onSuccess: (filename) => {
        setLastExport(filename)
        toast.success(`Exported ${filename}.`)
      },
      onError: () => setLastExport(undefined),
    })
  }

  // --- Render ---------------------------------------------------------------

  const activeFilters = hasActiveFilters(state)
  const list = transactions.data
  const rows = list?.results ?? []
  const typing = state.filters.search !== debouncedSearch

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
          Reports
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Totals by month or by book, a searchable transaction list, and CSV export. Totals come
          from the server.
        </p>
      </div>

      <ReportScopeControls
        books={bookList}
        booksLoading={books.isPending}
        booksFailed={books.isError}
        bookId={state.bookId}
        period={state.period}
        selected={selected}
        current={current}
        onBookChange={selectBook}
        onPeriodChange={selectPeriod}
        onMonthChange={selectMonth}
      />

      {bookNotFound ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-6 text-center">
          <h2 className="text-base font-semibold text-text-primary">Book not found</h2>
          <p className="text-sm text-text-secondary">
            This book doesn&apos;t exist or you don&apos;t have access to it.
          </p>
          <button type="button" className={primaryButton} onClick={() => selectBook(undefined)}>
            Report on all books
          </button>
        </div>
      ) : (
        <>
          {/* --- Totals --------------------------------------------------- */}
          {bookMode && (
            <>
              {bookReport.isPending && <LoadingSkeleton label="Loading book report" rows={3} />}
              {bookReport.isError && (
                <ErrorState
                  message={getApiErrorMessage(bookReport.error, 'Could not load the book report.')}
                  onRetry={() => void bookReport.refetch()}
                  retrying={bookReport.isFetching}
                />
              )}
              {bookReport.data && <BookReportSummary report={bookReport.data} />}
            </>
          )}

          {monthMode && (
            <>
              {monthlyReport.isPending && (
                <LoadingSkeleton label={`Loading ${monthLabel(selected)}`} rows={4} />
              )}
              {monthlyReport.isError && (
                <ErrorState
                  message={getApiErrorMessage(
                    monthlyReport.error,
                    `Could not load the report for ${monthLabel(selected)}.`,
                  )}
                  onRetry={() => void monthlyReport.refetch()}
                  retrying={monthlyReport.isFetching}
                />
              )}
              {monthlyReport.data && (
                <div
                  className="space-y-6"
                  aria-busy={monthlyReport.isFetching}
                  data-testid="monthly-report"
                >
                  <section aria-label={`${monthLabel(selected)} totals`}>
                    <KpiRow
                      income={monthlyReport.data.income_total}
                      expenses={monthlyReport.data.expense_total}
                      net={monthlyReport.data.net_cash_flow}
                    />
                  </section>
                  <div className="grid gap-6 lg:grid-cols-2">
                    <BookTypeBreakdown rows={monthlyReport.data.book_type_breakdown} />
                    <CategoryBreakdown
                      rows={monthlyReport.data.category_breakdown}
                      expenseTotal={monthlyReport.data.expense_total}
                    />
                  </div>
                  <DashboardBudgetCard
                    budget={monthlyReport.data.budget}
                    period={monthlyReport.data.period}
                  />
                </div>
              )}
              <MonthlyHistory selected={selected} onSelect={selectMonth} />
            </>
          )}

          {!bookMode && !monthMode && (
            <p
              role="note"
              className="rounded-card border border-border bg-surface p-4 text-sm text-text-secondary"
              data-testid="no-totals-note"
            >
              Totals are available for a calendar month or for a single book. This scope narrows
              the transaction list and CSV export only.{' '}
              <button
                type="button"
                className="font-medium text-brand-700 underline focus:outline-none focus:ring-2 focus:ring-brand-700"
                onClick={() => selectPeriod('month')}
              >
                Show monthly totals
              </button>
            </p>
          )}

          {/* --- Transactions: filters, export, list ----------------------- */}
          <section aria-label="Transactions" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <h2 className="text-title-mobile font-bold text-text-primary lg:text-lg">
                  Transactions
                </h2>
                {list && (
                  <span
                    className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-text-secondary"
                    data-testid="transaction-count"
                  >
                    {list.count}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowFilters((prev) => !prev)}
                aria-expanded={showFilters}
                className={secondaryButton}
              >
                {showFilters ? 'Hide filters' : 'Filters'}
                {activeFilters && (
                  <span className="ml-2 h-2 w-2 rounded-full bg-brand-700" aria-label="Active filters" />
                )}
              </button>
            </div>

            {state.period === 'range' && (
              <div className="grid gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="report-date-from"
                    className="mb-1 block text-caption font-medium text-text-secondary"
                  >
                    Report from date
                  </label>
                  <input
                    id="report-date-from"
                    type="date"
                    value={state.filters.date_from ?? ''}
                    onChange={(e) =>
                      changeFilters({
                        ...state.filters,
                        date_from: e.target.value || undefined,
                        page: 1,
                      })
                    }
                    className="block w-full min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body text-text-primary focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700"
                  />
                </div>
                <div>
                  <label
                    htmlFor="report-date-to"
                    className="mb-1 block text-caption font-medium text-text-secondary"
                  >
                    Report to date
                  </label>
                  <input
                    id="report-date-to"
                    type="date"
                    value={state.filters.date_to ?? ''}
                    onChange={(e) =>
                      changeFilters({
                        ...state.filters,
                        date_to: e.target.value || undefined,
                        page: 1,
                      })
                    }
                    className="block w-full min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body text-text-primary focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700"
                  />
                </div>
                {inverted && (
                  <p role="alert" className="text-sm text-danger-text sm:col-span-2">
                    The start date must be on or before the end date.
                  </p>
                )}
              </div>
            )}

            {showFilters && (
              <TransactionFilters
                filters={state.filters}
                onChange={changeFilters}
                onClear={clearFilters}
                hasActiveFilters={activeFilters}
                showDates={false}
              />
            )}

            <CsvExportAction
              summary={summary}
              onExport={handleExport}
              pending={csvExport.isPending}
              disabled={inverted}
              disabledReason={inverted ? 'Fix the date range before exporting.' : undefined}
              errorMessage={
                csvExport.isError
                  ? getApiErrorMessage(csvExport.error, 'Could not export the CSV. Please try again.')
                  : undefined
              }
              successFilename={lastExport}
            />

            {!inverted && transactions.isPending && (
              <LoadingSkeleton label="Loading transactions" rows={3} />
            )}

            {!inverted && transactions.isError && (
              <ErrorState
                message={getApiErrorMessage(transactions.error, 'Could not load transactions.')}
                onRetry={() => void transactions.refetch()}
                retrying={transactions.isFetching}
              />
            )}

            {!inverted && list && rows.length === 0 && (
              <EmptyState
                title={activeFilters ? 'No matching transactions' : 'No transactions in this scope'}
                description={
                  activeFilters
                    ? 'No transactions match your selected filters.'
                    : 'Add an entry, or choose a different month, book or date range.'
                }
                action={
                  activeFilters ? (
                    <button type="button" className={secondaryButton} onClick={clearFilters}>
                      Clear filters
                    </button>
                  ) : (
                    <Link to="/transactions/new" className={primaryButton}>
                      + Add transaction
                    </Link>
                  )
                }
              />
            )}

            {!inverted && list && rows.length > 0 && (
              <div
                className="space-y-2"
                data-testid="report-transactions"
                aria-busy={transactions.isFetching || typing}
              >
                {rows.map((txn) => (
                  <TransactionRow
                    key={txn.id}
                    transaction={txn}
                    bookName={bookMode ? undefined : (bookNames.get(txn.book_id) ?? 'Open book')}
                  />
                ))}
                <Pagination
                  page={state.filters.page ?? 1}
                  hasPrevious={Boolean(list.previous)}
                  hasNext={Boolean(list.next)}
                  onPageChange={(page) =>
                    update({ ...state, filters: { ...state.filters, page } }, { replace: false })
                  }
                />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
