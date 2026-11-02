/**
 * BudgetsPage — UX-08 (`/budgets`).
 *
 * Shows the monthly overall budget for the selected month (from
 * GET /reports/budget-utilization/, identical to GET /budgets/{id}/) and the
 * user's event budgets (GET /budgets/?scope=EVENT).  Selected month lives in
 * the URL (`?year=&month=`), defaulting to the current month in the user's
 * timezone.  All spending / remaining / status values come from the server.
 */

import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/StateViews'
import { primaryButton, secondaryButton } from '@/components/ui/styles'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthContext'
import MonthNavigator from '@/features/books/components/MonthNavigator'
import Pagination from '@/features/books/components/Pagination'
import { useAllBooks } from '@/features/books/hooks/useBooks'
import type { YearMonth } from '@/features/books/types'
import { getCurrentYearMonth, monthLabel, parseYearMonth } from '@/features/books/utils'
import { useBudgetUtilization } from '@/features/dashboard/hooks/useReports'
import { getApiErrorMessage } from '@/services/api/errors'
import type { Budget } from '@/types'
import BudgetLimitDialog from './components/BudgetLimitDialog'
import BudgetProgress from './components/BudgetProgress'
import { useBudgetsList, useCreateBudget, useUpdateBudget } from './hooks/useBudgets'
import { normalizeAmount, toEventBudgetPayload, toMonthlyBudgetPayload } from './utils'

type Dialog =
  | { kind: 'create-monthly' }
  | { kind: 'edit-monthly'; budget: Budget }
  | { kind: 'create-event' }
  | null

export default function BudgetsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [eventPage, setEventPage] = useState(1)

  const current = useMemo(() => getCurrentYearMonth(user?.timezone), [user?.timezone])
  const selected: YearMonth =
    parseYearMonth(searchParams.get('year'), searchParams.get('month')) ?? current

  const utilization = useBudgetUtilization(selected.year, selected.month)
  const eventBudgets = useBudgetsList({ scope: 'EVENT', page: eventPage })
  // Event books: names for the list and candidates for new event budgets.
  const eventBooks = useAllBooks({ type: 'EVENT', ordering: 'name' })

  const createBudget = useCreateBudget()
  const updateBudget = useUpdateBudget()

  const bookNames = useMemo(
    () => new Map((eventBooks.data ?? []).map((b) => [b.id, b.name])),
    [eventBooks.data],
  )
  const bookOptions = useMemo(() => {
    const withBudget = new Set((eventBudgets.data?.results ?? []).map((b) => b.book_id))
    return (eventBooks.data ?? []).filter(
      (b) => !b.is_archived && !withBudget.has(b.id),
    )
  }, [eventBooks.data, eventBudgets.data])

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

  const monthlyBudget = utilization.data?.budget ?? null

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
          Budgets
        </h1>
        <MonthNavigator value={selected} current={current} onChange={selectMonth} />
      </div>

      {/* ---------------- Overall monthly budget ---------------- */}
      <section aria-labelledby="monthly-budget-heading" className="space-y-3">
        <h2 id="monthly-budget-heading" className="text-lg font-semibold text-text-primary">
          Overall monthly budget — {monthLabel(selected)}
        </h2>
        <p className="text-sm text-text-secondary">
          Includes expenses from every book dated in this month. Overspending is never blocked.
        </p>

        {utilization.isPending && <LoadingSkeleton label="Loading monthly budget" rows={1} />}

        {utilization.isError && (
          <ErrorState
            message={getApiErrorMessage(utilization.error, 'Could not load the monthly budget.')}
            onRetry={() => void utilization.refetch()}
            retrying={utilization.isFetching}
          />
        )}

        {utilization.isSuccess && monthlyBudget === null && (
          <EmptyState
            title="No budget set for this month"
            description="Set an overall limit to track spending across all your books."
            action={
              <button
                type="button"
                className={primaryButton}
                onClick={() => setDialog({ kind: 'create-monthly' })}
              >
                Set budget
              </button>
            }
          />
        )}

        {utilization.isSuccess && monthlyBudget !== null && (
          <div className="rounded-card border border-border bg-surface p-4">
            <BudgetProgress
              label="Overall monthly"
              limit={monthlyBudget.total_limit}
              spent={monthlyBudget.spent}
              remaining={monthlyBudget.remaining}
              utilizationPercent={monthlyBudget.utilization_percent}
              status={monthlyBudget.status}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to={`/budgets/${monthlyBudget.id}`} className={primaryButton}>
                Category allocations
              </Link>
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setDialog({ kind: 'edit-monthly', budget: monthlyBudget })}
              >
                Edit overall budget
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ---------------- Event budgets ---------------- */}
      <section aria-labelledby="event-budgets-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="event-budgets-heading" className="text-lg font-semibold text-text-primary">
            Event budgets
          </h2>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => setDialog({ kind: 'create-event' })}
          >
            Add event budget
          </button>
        </div>
        <p className="text-sm text-text-secondary">
          An event budget counts expenses recorded in its event book, on any date.
        </p>

        {eventBudgets.isPending && <LoadingSkeleton label="Loading event budgets" rows={2} />}

        {eventBudgets.isError && (
          <ErrorState
            message={getApiErrorMessage(eventBudgets.error, 'Could not load event budgets.')}
            onRetry={() => void eventBudgets.refetch()}
            retrying={eventBudgets.isFetching}
          />
        )}

        {eventBudgets.isSuccess && eventBudgets.data.results.length === 0 && (
          <EmptyState
            title="No event budgets yet"
            description="Create an event book, then set a budget for it."
          />
        )}

        {eventBudgets.isSuccess && eventBudgets.data.results.length > 0 && (
          <>
            <ul className="grid gap-3 md:grid-cols-2">
              {eventBudgets.data.results.map((b) => (
                <li
                  key={b.id}
                  data-testid="event-budget"
                  className="rounded-card border border-border bg-surface p-4"
                >
                  <BudgetProgress
                    compact
                    label={bookNames.get(b.book_id ?? '') ?? 'Event budget'}
                    limit={b.total_limit}
                    spent={b.spent}
                    remaining={b.remaining}
                    utilizationPercent={b.utilization_percent}
                    status={b.status}
                  />
                  <Link
                    to={`/budgets/${b.id}`}
                    aria-label={`Open ${bookNames.get(b.book_id ?? '') ?? 'event'} budget`}
                    className={`${secondaryButton} mt-3`}
                  >
                    Open
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination
              page={eventPage}
              hasPrevious={Boolean(eventBudgets.data.previous)}
              hasNext={Boolean(eventBudgets.data.next)}
              onPageChange={setEventPage}
            />
          </>
        )}
      </section>

      {/* ---------------- Dialogs ---------------- */}
      {dialog?.kind === 'create-monthly' && (
        <BudgetLimitDialog
          title={`Set budget for ${monthLabel(selected)}`}
          submitLabel="Set budget"
          onClose={() => setDialog(null)}
          onSubmit={async ({ limit }) => {
            await createBudget.mutateAsync(
              toMonthlyBudgetPayload(selected.year, selected.month, limit),
            )
            toast.success('Budget created.')
            setDialog(null)
          }}
        />
      )}

      {dialog?.kind === 'edit-monthly' && (
        <BudgetLimitDialog
          title="Edit overall budget"
          submitLabel="Save changes"
          initialLimit={dialog.budget.total_limit}
          onClose={() => setDialog(null)}
          onSubmit={async ({ limit }) => {
            await updateBudget.mutateAsync({
              id: dialog.budget.id,
              payload: { total_limit: normalizeAmount(limit) },
            })
            toast.success('Budget updated.')
            setDialog(null)
          }}
        />
      )}

      {dialog?.kind === 'create-event' && (
        <BudgetLimitDialog
          title="Add event budget"
          submitLabel="Add event budget"
          bookOptions={bookOptions}
          onClose={() => setDialog(null)}
          onSubmit={async ({ limit, bookId }) => {
            await createBudget.mutateAsync(toEventBudgetPayload(bookId, limit))
            toast.success('Event budget created.')
            setDialog(null)
          }}
        />
      )}
    </div>
  )
}
