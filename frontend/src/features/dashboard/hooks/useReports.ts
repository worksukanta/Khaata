/**
 * TanStack Query hooks for the reporting endpoints.
 *
 * Query keys:
 *   ['reports', 'monthly', year, month]            combined monthly dashboard
 *   ['reports', 'budget-utilization', year, month] monthly overall budget progress
 *   ['reports', 'book', id]                        book-scoped report
 *
 * Transaction and budget mutations invalidate the whole ['reports'] prefix so
 * server-derived figures are re-read after every successful write (no
 * optimistic financial totals).
 */

import { useQuery } from '@tanstack/react-query'
import { getBookReport, getBudgetUtilization, getMonthlyReport } from '@/services/api/reports'

export const reportKeys = {
  all: ['reports'] as const,
  monthly: (year: number, month: number) => ['reports', 'monthly', year, month] as const,
  utilization: (year: number, month: number) =>
    ['reports', 'budget-utilization', year, month] as const,
  book: (id: string) => ['reports', 'book', id] as const,
}

export function useMonthlyReport(year: number, month: number, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: reportKeys.monthly(year, month),
    queryFn: ({ signal }) => getMonthlyReport(year, month, signal),
    enabled: options.enabled ?? true,
  })
}

export function useBudgetUtilization(year: number, month: number) {
  return useQuery({
    queryKey: reportKeys.utilization(year, month),
    queryFn: ({ signal }) => getBudgetUtilization(year, month, signal),
  })
}

export function useBookReport(id: string | undefined) {
  return useQuery({
    queryKey: reportKeys.book(id ?? ''),
    queryFn: ({ signal }) => getBookReport(id as string, signal),
    enabled: Boolean(id),
  })
}
