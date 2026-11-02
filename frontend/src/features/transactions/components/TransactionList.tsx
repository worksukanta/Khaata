/**
 * TransactionList — transaction history view with filtering, pagination, and empty states.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/StateViews'
import { primaryButton } from '@/components/ui/styles'
import Pagination from '@/features/books/components/Pagination'
import { useDebouncedValue } from '@/features/books/hooks/useBooks'
import { useTransactionsList } from '@/features/transactions/hooks/useTransactions'
import { getApiErrorMessage } from '@/services/api/errors'
import type { Book, TransactionListParams } from '@/types'
import type { TransactionFilterState } from '../types'
import TransactionFilters from './TransactionFilters'
import TransactionRow from './TransactionRow'

interface TransactionListProps {
  book?: Book
  bookId?: string
  readOnly?: boolean
}

const DEFAULT_FILTERS: TransactionFilterState = {
  type: undefined,
  category_id: undefined,
  payment_method_id: undefined,
  date_from: undefined,
  date_to: undefined,
  search: '',
  ordering: '-transaction_date',
  page: 1,
}

export default function TransactionList({
  book,
  bookId = book?.id,
  readOnly = book?.is_archived ?? false,
}: TransactionListProps) {
  const [filters, setFilters] = useState<TransactionFilterState>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)

  const debouncedSearch = useDebouncedValue(filters.search, 300)

  const queryParams = useMemo<TransactionListParams>(() => {
    const params: TransactionListParams = {
      book_id: bookId,
      page: filters.page,
      ordering: filters.ordering,
    }
    if (filters.type && filters.type !== 'ALL') params.type = filters.type
    if (filters.category_id) params.category_id = filters.category_id
    if (filters.payment_method_id) params.payment_method_id = filters.payment_method_id
    if (filters.date_from) params.date_from = filters.date_from
    if (filters.date_to) params.date_to = filters.date_to
    if (debouncedSearch?.trim()) params.search = debouncedSearch.trim()
    return params
  }, [bookId, filters, debouncedSearch])

  const transactionsQuery = useTransactionsList(queryParams)

  const hasActiveFilters = Boolean(
    (filters.type && filters.type !== 'ALL') ||
      filters.category_id ||
      filters.payment_method_id ||
      filters.date_from ||
      filters.date_to ||
      filters.search?.trim() ||
      filters.ordering !== '-transaction_date',
  )

  function handleClearFilters() {
    setFilters(DEFAULT_FILTERS)
  }

  if (transactionsQuery.isPending) {
    return <LoadingSkeleton label="Loading transactions" rows={4} />
  }

  if (transactionsQuery.isError) {
    return (
      <ErrorState
        message={getApiErrorMessage(
          transactionsQuery.error,
          'Could not load transactions.',
        )}
        onRetry={() => void transactionsQuery.refetch()}
        retrying={transactionsQuery.isFetching}
      />
    )
  }

  const data = transactionsQuery.data
  const transactions = data?.results ?? []
  const count = data?.count ?? 0

  return (
    <section aria-label="Transactions" className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-title-mobile font-bold text-text-primary lg:text-lg">
            Transactions
          </h2>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-text-secondary">
            {count}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="inline-flex min-h-touch items-center gap-1.5 rounded-input border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary hover:bg-gray-50 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700"
            aria-expanded={showFilters}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
              />
            </svg>
            <span>{showFilters ? 'Hide filters' : 'Filters'}</span>
            {hasActiveFilters && (
              <span className="h-2 w-2 rounded-full bg-brand-700" aria-label="Active filters" />
            )}
          </button>

          {!readOnly && (
            <Link
              to={bookId ? `/transactions/new?bookId=${encodeURIComponent(bookId)}` : '/transactions/new'}
              className={primaryButton}
            >
              + Add transaction
            </Link>
          )}
        </div>
      </div>

      {showFilters && (
        <TransactionFilters
          filters={filters}
          onChange={setFilters}
          onClear={handleClearFilters}
          hasActiveFilters={hasActiveFilters}
        />
      )}

      {transactions.length === 0 ? (
        hasActiveFilters ? (
          <EmptyState
            title="No matching transactions"
            description="No transactions match your selected filters."
            action={
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex min-h-touch items-center justify-center rounded-input border border-border bg-surface px-4 py-2 text-sm font-semibold text-text-primary hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-brand-700"
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState
            title="No transactions yet"
            description="Add your first income or expense entry to start tracking."
            action={
              !readOnly ? (
                <Link
                  to={
                    bookId
                      ? `/transactions/new?bookId=${encodeURIComponent(bookId)}`
                      : '/transactions/new'
                  }
                  className={primaryButton}
                >
                  + Add transaction
                </Link>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="space-y-2" data-testid="transactions-list">
          {transactions.map((txn) => (
            <TransactionRow key={txn.id} transaction={txn} readOnly={readOnly} />
          ))}

          <Pagination
            page={filters.page ?? 1}
            hasPrevious={Boolean(data?.previous)}
            hasNext={Boolean(data?.next)}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          />
        </div>
      )}
    </section>
  )
}
