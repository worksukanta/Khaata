/**
 * Historical context for the Reports page: the combined monthly report for the
 * selected month and the months before it.  Each month is one
 * GET /reports/monthly/ call sharing the dashboard's cache entries.
 */

import { useQueries } from '@tanstack/react-query'
import type { YearMonth } from '@/features/books/types'
import { isWithinSupportedRange, shiftMonth } from '@/features/books/utils'
import { getMonthlyReport } from '@/services/api/reports'
import { reportKeys } from '@/features/dashboard/hooks/useReports'

export const HISTORY_MONTHS = 6

/** The selected month followed by the preceding months, newest first. */
export function historyMonths(selected: YearMonth, count = HISTORY_MONTHS): YearMonth[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(selected, -i)).filter(
    isWithinSupportedRange,
  )
}

export function useMonthlyHistory(selected: YearMonth) {
  const months = historyMonths(selected)
  const results = useQueries({
    queries: months.map((m) => ({
      queryKey: reportKeys.monthly(m.year, m.month),
      queryFn: ({ signal }: { signal: AbortSignal }) => getMonthlyReport(m.year, m.month, signal),
    })),
  })
  return months.map((month, i) => ({ month, query: results[i] }))
}
