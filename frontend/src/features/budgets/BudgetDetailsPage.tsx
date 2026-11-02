/**
 * BudgetDetailsPage — UX-09 (`/budgets/:id`).
 *
 * Overall limit, server-derived progress, per-category progress, and the
 * allocation editor.  Monthly budgets show their calendar month; event budgets
 * show their event book and note that they count its expenses on any date.
 * Non-UUID ids are treated as not found without a request; 404 → generic
 * not-found state (no leak of other users' resources).
 */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingSkeleton } from '@/components/ui/StateViews'
import { primaryButton, secondaryButton } from '@/components/ui/styles'
import { useToast } from '@/components/ui/Toast'
import { useBook } from '@/features/books/hooks/useBooks'
import { formatMoney, monthLabel } from '@/features/books/utils'
import { useCategoriesList } from '@/features/transactions/hooks/useCategories'
import { getApiErrorCode, getApiErrorMessage } from '@/services/api/errors'
import AllocationEditor from './components/AllocationEditor'
import AllocationProgressList from './components/AllocationProgressList'
import BudgetLimitDialog from './components/BudgetLimitDialog'
import BudgetProgress from './components/BudgetProgress'
import { useBudget, useReplaceAllocations, useUpdateBudget } from './hooks/useBudgets'
import { normalizeAmount } from './utils'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function BudgetNotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
        Budget not found
      </h1>
      <p className="text-text-secondary">
        This budget doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link to="/budgets" className={primaryButton}>
        Back to Budgets
      </Link>
    </div>
  )
}

export default function BudgetDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const validId = id && UUID_RE.test(id) ? id : undefined
  const toast = useToast()
  const [editingLimit, setEditingLimit] = useState(false)

  const budgetQuery = useBudget(validId)
  const budget = budgetQuery.data
  const eventBookQuery = useBook(budget?.scope === 'EVENT' ? (budget.book_id ?? undefined) : undefined)
  const categories = useCategoriesList({ type: 'EXPENSE', is_active: true })

  const updateBudget = useUpdateBudget()
  const replaceAllocations = useReplaceAllocations()

  if (!validId) return <BudgetNotFound />
  if (budgetQuery.isPending) return <LoadingSkeleton label="Loading budget" rows={2} />

  if (budgetQuery.isError) {
    if (getApiErrorCode(budgetQuery.error) === 'not_found') return <BudgetNotFound />
    return (
      <ErrorState
        message={getApiErrorMessage(budgetQuery.error, 'Could not load this budget.')}
        onRetry={() => void budgetQuery.refetch()}
        retrying={budgetQuery.isFetching}
      />
    )
  }

  const data = budgetQuery.data
  const isMonthly = data.scope === 'MONTHLY_OVERALL'
  const period =
    isMonthly && data.year !== null && data.month !== null
      ? { year: data.year, month: data.month }
      : null
  const title = isMonthly
    ? `Overall monthly budget${period ? ` — ${monthLabel(period)}` : ''}`
    : `Event budget — ${eventBookQuery.data?.name ?? 'Event book'}`
  const backTo = period ? `/budgets?year=${period.year}&month=${period.month}` : '/budgets'

  return (
    <div className="space-y-6">
      <Link
        to={backTo}
        className="inline-flex min-h-touch items-center text-sm font-medium text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-700"
      >
        ← Back to Budgets
      </Link>

      <div>
        <h1 className="break-words text-title-mobile font-bold text-text-primary lg:text-title-desktop">
          {title}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {isMonthly
            ? 'Counts expenses from every book dated in this month.'
            : 'Counts expenses recorded in this event book, on any date.'}
        </p>
      </div>

      <section
        aria-label="Budget summary"
        className="rounded-card border border-border bg-surface p-4"
      >
        <BudgetProgress
          label={isMonthly ? 'Overall monthly' : 'Event budget'}
          limit={data.total_limit}
          spent={data.spent}
          remaining={data.remaining}
          utilizationPercent={data.utilization_percent}
          status={data.status}
        />
        <p className="mt-3 text-sm text-text-secondary">
          Total limit:{' '}
          <span className="font-semibold tabular-nums text-text-primary" data-testid="total-limit">
            {formatMoney(data.total_limit)}
          </span>
        </p>
        <button
          type="button"
          className={`${secondaryButton} mt-3`}
          onClick={() => setEditingLimit(true)}
        >
          Edit limit
        </button>
      </section>

      <AllocationProgressList budget={data} />

      {categories.isPending && <LoadingSkeleton label="Loading categories" rows={1} />}
      {categories.isError && (
        <ErrorState
          message={getApiErrorMessage(categories.error, 'Could not load expense categories.')}
          onRetry={() => void categories.refetch()}
          retrying={categories.isFetching}
        />
      )}
      {categories.isSuccess && (
        <AllocationEditor
          budget={data}
          categories={categories.data.results}
          onSave={async (allocations) => {
            await replaceAllocations.mutateAsync({ id: data.id, allocations })
            toast.success('Allocations saved.')
          }}
        />
      )}

      {editingLimit && (
        <BudgetLimitDialog
          title="Edit budget limit"
          submitLabel="Save changes"
          initialLimit={data.total_limit}
          onClose={() => setEditingLimit(false)}
          onSubmit={async ({ limit }) => {
            await updateBudget.mutateAsync({
              id: data.id,
              payload: { total_limit: normalizeAmount(limit) },
            })
            toast.success('Budget limit updated.')
            setEditingLimit(false)
          }}
        />
      )}
    </div>
  )
}
