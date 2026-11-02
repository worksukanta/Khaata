/**
 * DashboardBudgetCard — monthly overall budget block of GET /reports/monthly/.
 *
 * `NOT_SET` (report-only status, all figures null) renders a "Set a budget" CTA.
 * Otherwise the server's spent / remaining / utilization / status are shown as-is.
 */

import { Link } from 'react-router-dom'
import { primaryButton } from '@/components/ui/styles'
import BudgetProgress from '@/features/budgets/components/BudgetProgress'
import type { MonthlyReportBudget, ReportPeriod } from '@/types'

export default function DashboardBudgetCard({
  budget,
  period,
}: {
  budget: MonthlyReportBudget
  period: ReportPeriod
}) {
  const { total_limit, spent, remaining, status } = budget
  const hasFigures =
    status !== 'NOT_SET' && total_limit !== null && spent !== null && remaining !== null

  return (
    <section
      aria-labelledby="dash-budget-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="dash-budget-heading" className="text-base font-semibold text-text-primary">
        Monthly budget
      </h2>

      {hasFigures ? (
        <div className="mt-3">
          <BudgetProgress
            label="Overall monthly"
            limit={total_limit}
            spent={spent}
            remaining={remaining}
            utilizationPercent={budget.utilization_percent}
            status={status}
          />
          <Link
            to={`/budgets?year=${period.year}&month=${period.month}`}
            className="mt-3 inline-flex min-h-touch items-center text-sm font-medium text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-700"
          >
            View budget details
          </Link>
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-sm text-text-secondary">
            No overall budget is set for this month. Expenses from every book still count once
            you set one.
          </p>
          <Link
            to={`/budgets?year=${period.year}&month=${period.month}`}
            className={`${primaryButton} mt-3`}
          >
            Set a budget
          </Link>
        </div>
      )}
    </section>
  )
}
