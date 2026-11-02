/**
 * AllocationProgressList — per-category progress of a budget, exactly as the
 * server computed it (spent / remaining / utilization / status), plus the
 * unallocated and uncategorised spending buckets.
 *
 * "Uncategorised" is a distinct reporting bucket: it consumes the overall limit
 * but no category allocation (UI_UX_SPECIFICATION §5/§6).
 */

import { formatMoney } from '@/features/books/utils'
import type { Budget } from '@/types'
import BudgetProgress from './BudgetProgress'

export default function AllocationProgressList({ budget }: { budget: Budget }) {
  return (
    <section
      aria-labelledby="allocation-progress-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="allocation-progress-heading" className="text-base font-semibold text-text-primary">
        Category progress
      </h2>

      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-caption text-text-secondary">Allocated</dt>
          <dd className="tabular-nums text-text-primary" data-testid="allocated-total">
            {formatMoney(budget.allocated_total)}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">Unallocated</dt>
          <dd className="tabular-nums text-text-primary" data-testid="unallocated">
            {formatMoney(budget.unallocated)}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">Spending outside allocations</dt>
          <dd className="tabular-nums text-text-primary" data-testid="unallocated-spent">
            {formatMoney(budget.unallocated_spent)}
          </dd>
        </div>
      </dl>

      {budget.allocations.length === 0 ? (
        <p className="mt-4 text-sm text-text-secondary">
          No category allocations yet. Allocations are optional — all spending still counts
          against the overall limit.
        </p>
      ) : (
        <ul className="mt-4 space-y-5">
          {budget.allocations.map((a) => (
            <li key={a.category.id} data-testid="allocation-progress">
              <BudgetProgress
                compact
                label={a.category.is_active ? a.category.name : `${a.category.name} (Inactive)`}
                limit={a.amount}
                spent={a.spent}
                remaining={a.remaining}
                utilizationPercent={a.utilization_percent}
                status={a.status}
              />
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-sm tabular-nums text-text-secondary" data-testid="uncategorised">
        <span className="italic">Uncategorised</span> spending:{' '}
        <span className="font-medium text-text-primary">
          {formatMoney(budget.uncategorised_spent)}
        </span>{' '}
        (counts toward the overall limit only)
      </p>
    </section>
  )
}
