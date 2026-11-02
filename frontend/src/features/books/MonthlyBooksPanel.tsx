/**
 * MonthlyBooksPanel — Monthly tab of the Books screen (UX-04).
 *
 * The selected month lives in the URL (`?tab=monthly&year=YYYY&month=M`) and
 * defaults to the current month in the user's timezone.  Whenever a month is
 * selected, POST /books/monthly/{year}/{month}/ensure/ is called (through a
 * de-duplicated query) and the book is shown/openable only after it succeeds.
 * Below, previously created monthly books are listed (GET /books/?type=MONTHLY).
 *
 * Monthly books never show edit/archive/restore controls.
 */

import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/features/auth/AuthContext'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/StateViews'
import { getApiErrorMessage } from '@/services/api/errors'
import BookCard from './components/BookCard'
import MonthNavigator from './components/MonthNavigator'
import Pagination from './components/Pagination'
import { bookKeys, useBooksList, useEnsureMonthlyBook } from './hooks/useBooks'
import { getCurrentYearMonth, monthLabel, parseYearMonth, sortMonthlyDesc } from './utils'
import type { YearMonth } from './types'

export default function MonthlyBooksPanel() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const timezone = user?.timezone
  const current = useMemo(() => getCurrentYearMonth(timezone), [timezone])
  const selected: YearMonth =
    parseYearMonth(searchParams.get('year'), searchParams.get('month')) ?? current

  const pageParam = Number(searchParams.get('page'))
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1

  const ensure = useEnsureMonthlyBook(selected.year, selected.month)
  const list = useBooksList({ type: 'MONTHLY', ordering: '-created_at', page })

  // A newly created monthly book must appear in the list below.
  const created = ensure.data?.created
  useEffect(() => {
    if (created) void queryClient.invalidateQueries({ queryKey: bookKeys.lists() })
  }, [created, queryClient])

  // Page past the end after data changes → return to the first page.
  const listErrorCode = (list.error as { error?: { code?: string } } | null)?.error?.code
  useEffect(() => {
    if (list.isError && page > 1 && listErrorCode === 'not_found') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('page')
          return next
        },
        { replace: true },
      )
    }
  }, [list.isError, listErrorCode, page, setSearchParams])

  function selectMonth(next: YearMonth) {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev)
        params.set('tab', 'monthly')
        params.set('year', String(next.year))
        params.set('month', String(next.month))
        return params
      },
      { replace: false },
    )
  }

  const books = useMemo(() => sortMonthlyDesc(list.data?.results ?? []), [list.data])

  return (
    <div className="space-y-6">
      <section aria-labelledby="selected-month-heading" className="space-y-4">
        <h2 id="selected-month-heading" className="text-base font-semibold text-text-primary">
          Selected month
        </h2>
        <MonthNavigator value={selected} current={current} onChange={selectMonth} />

        {ensure.isPending && (
          <div>
            <LoadingSkeleton label={`Preparing ${monthLabel(selected)}`} rows={1} />
            <p className="mt-2 text-sm text-text-secondary" aria-live="polite">
              Preparing {monthLabel(selected)}…
            </p>
          </div>
        )}

        {ensure.isError && (
          <ErrorState
            message={getApiErrorMessage(
              ensure.error,
              `Could not open ${monthLabel(selected)}. Please try again.`,
            )}
            onRetry={() => void ensure.refetch()}
            retrying={ensure.isFetching}
          />
        )}

        {ensure.isSuccess && (
          <ul className="space-y-3" aria-label={`${monthLabel(selected)} book`}>
            <BookCard book={ensure.data.book} />
          </ul>
        )}
      </section>

      <section aria-labelledby="all-monthly-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="all-monthly-heading" className="text-base font-semibold text-text-primary">
            All monthly books
          </h2>
          {list.isFetching && !list.isPending && (
            <span className="text-caption text-text-secondary" aria-live="polite">
              Updating…
            </span>
          )}
        </div>

        {list.isPending && <LoadingSkeleton label="Loading monthly books" />}

        {list.isError && !list.isPending && (
          <ErrorState
            message={getApiErrorMessage(list.error, 'Could not load monthly books.')}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        )}

        {list.isSuccess && books.length === 0 && (
          <EmptyState
            title="No monthly books yet"
            description="A monthly book is created automatically when you open a month above."
          />
        )}

        {list.isSuccess && books.length > 0 && (
          <>
            <ul className="grid gap-3 md:grid-cols-2">
              {books.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </ul>
            <Pagination
              page={page}
              hasPrevious={Boolean(list.data.previous)}
              hasNext={Boolean(list.data.next)}
              onPageChange={(p) =>
                setSearchParams((prev) => {
                  const params = new URLSearchParams(prev)
                  if (p <= 1) params.delete('page')
                  else params.set('page', String(p))
                  return params
                })
              }
            />
          </>
        )}
      </section>
    </div>
  )
}
