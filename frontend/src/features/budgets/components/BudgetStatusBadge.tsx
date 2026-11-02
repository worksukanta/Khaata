/**
 * BudgetStatusBadge — status label with a text glyph, so status is never
 * conveyed by colour alone (DESIGN_SYSTEM.md "Visual semantics").
 * The status itself always comes from the server.
 */

import type { BudgetStatus } from '@/types'
import { STATUS_GLYPH, STATUS_LABEL } from '../utils'

const TONE: Record<BudgetStatus, string> = {
  ON_TRACK: 'bg-brand-50 text-brand-700',
  NEAR_LIMIT: 'bg-warning-bg text-warning-text',
  OVER_BUDGET: 'bg-danger-bg text-danger-text',
  UNBUDGETED_SPENDING: 'bg-danger-bg text-danger-text',
  NOT_SET: 'bg-gray-100 text-text-secondary',
}

export default function BudgetStatusBadge({ status }: { status: BudgetStatus }) {
  return (
    <span
      data-testid="budget-status"
      data-status={status}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[status]}`}
    >
      <span aria-hidden="true">{STATUS_GLYPH[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  )
}
