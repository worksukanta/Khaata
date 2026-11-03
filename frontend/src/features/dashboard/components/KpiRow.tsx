/**
 * KpiRow — Income / Expenses / Net cash flow headline cards shared by the
 * dashboard (Home) and the Reports page.  Values are server-provided decimal
 * strings rendered verbatim; the only local logic is the sign check used to
 * flag a negative net (always with text, never colour alone).
 */

import { formatMoney } from '@/features/books/utils'
import { isNegativeMoney } from '@/features/budgets/utils'
import KpiCard from './KpiCard'

interface KpiRowProps {
  income: string
  expenses: string
  net: string
}

export default function KpiRow({ income, expenses, net }: KpiRowProps) {
  const negative = isNegativeMoney(net)
  return (
    <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
      <KpiCard label="Income" value={formatMoney(income)} testId="kpi-income" />
      <KpiCard label="Expenses" value={formatMoney(expenses)} testId="kpi-expenses" />
      <div className="min-[420px]:col-span-2 lg:col-span-1">
        <KpiCard
          label="Net cash flow"
          value={formatMoney(net)}
          tone={negative ? 'negative' : 'default'}
          note={negative ? 'Negative — expenses exceeded income' : 'Income minus expenses'}
          testId="kpi-net"
        />
      </div>
    </div>
  )
}
