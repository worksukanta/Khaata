/**
 * BudgetProgress — spent vs limit with a capped visual bar (DESIGN_SYSTEM.md).
 *
 * Every figure (spent, remaining, utilization, status) is rendered exactly as
 * returned by the server.  Only the bar width is derived locally, with BigInt,
 * and is capped at 100 % while the label shows the real utilization.
 *
 *  - OVER_BUDGET:          "₹X over budget" (never a positive remaining) + real percentage.
 *  - UNBUDGETED_SPENDING:  "Unbudgeted spending" — no percentage (null), no division.
 *  - Zero budget, no spend: ON_TRACK, 0.00 %.
 */

import { formatMoney } from '@/features/books/utils'
import type { BudgetStatus } from '@/types'
import { absMoney, barPercent } from '../utils'
import BudgetStatusBadge from './BudgetStatusBadge'

interface BudgetProgressProps {
  label: string
  limit: string
  spent: string
  remaining: string
  utilizationPercent: string | null
  status: BudgetStatus
  /** Heading level wrapper is left to the caller; this renders a labelled group. */
  compact?: boolean
}

const BAR_TONE: Partial<Record<BudgetStatus, string>> = {
  ON_TRACK: 'bg-brand-600',
  NEAR_LIMIT: 'bg-warning-text',
  OVER_BUDGET: 'bg-danger-text',
  UNBUDGETED_SPENDING: 'bg-danger-text',
}

export default function BudgetProgress({
  label,
  limit,
  spent,
  remaining,
  utilizationPercent,
  status,
  compact = false,
}: BudgetProgressProps) {
  const unbudgeted = status === 'UNBUDGETED_SPENDING'
  const width = unbudgeted ? 100 : barPercent(spent, limit)
  const over = status === 'OVER_BUDGET'

  return (
    <div data-testid="budget-progress" data-status={status}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`font-semibold text-text-primary ${compact ? 'text-sm' : 'text-base'}`}>
          {label}
        </p>
        <BudgetStatusBadge status={status} />
      </div>

      <p className="mt-1 text-sm tabular-nums text-text-secondary">
        <span className="font-semibold text-text-primary">{formatMoney(spent)}</span> spent of{' '}
        {formatMoney(limit)}
      </p>

      <div
        role="progressbar"
        aria-label={`${label} utilization`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={width}
        aria-valuetext={
          unbudgeted
            ? 'Unbudgeted spending'
            : utilizationPercent !== null
              ? `${utilizationPercent}% used`
              : undefined
        }
        className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100"
      >
        <div
          className={`h-full rounded-full ${BAR_TONE[status] ?? 'bg-gray-300'}`}
          style={{ width: `${width}%` }}
        />
      </div>

      <p className="mt-2 text-sm tabular-nums text-text-secondary" data-testid="budget-summary">
        {unbudgeted ? (
          <span className="font-medium text-danger-text">
            Unbudgeted spending — no limit set for {formatMoney(spent)} spent
          </span>
        ) : over ? (
          <span className="font-medium text-danger-text">
            {formatMoney(absMoney(remaining))} over budget
            {utilizationPercent !== null && ` · ${utilizationPercent}%`}
          </span>
        ) : (
          <>
            {formatMoney(remaining)} remaining
            {utilizationPercent !== null && ` · ${utilizationPercent}%`}
          </>
        )}
      </p>
    </div>
  )
}
