/**
 * TanStack Query hooks for the reporting endpoints.
 *
 * Query keys:
 *   ['reports', 'monthly', year, month]            combined monthly dashboard
 *   ['reports', 'budget-utilization', year, month] monthly overall budget progress
 *
 * Transaction and budget mutations invalidate the whole ['reports'] prefix so
 * server-derived figures are re-read after every successful write (no
 * optimistic financial totals).
 */

import { useQuery } from '@tanstack/react-query'
import { getBudgetUtilization, getMonthlyReport } from '@/services/api/reports'

export const reportKeys = {
  all: ['reports'] as const,
  monthly: (year: number, month: number) => ['reports', 'monthly', year, month] as const,
  utilization: (year: number, month: number) =>
    ['reports', 'budget-utilization', year, month] as const,
}

export function useMonthlyReport(year: number, month: number) {
  return useQuery({
    queryKey: reportKeys.monthly(year, month),
    queryFn: ({ signal }) => getMonthlyReport(year, month, signal),
  })
}

export function useBudgetUtilization(year: number, month: number) {
  return useQuery({
    queryKey: reportKeys.utilization(year, month),
    queryFn: ({ signal }) => getBudgetUtilization(year, month, signal),
  })
}
