/**
 * Reports service — read-only reporting endpoints (API_CONTRACT.md §7).
 *
 * Endpoints:
 *   GET /api/v1/reports/monthly/?year=&month=             getMonthlyReport
 *   GET /api/v1/reports/budget-utilization/?year=&month=  getBudgetUtilization
 *
 * `year` (2000–2200) and `month` (1–12) are required by the backend.
 */

import apiClient from './client'
import type { BudgetUtilizationReport, MonthlyReport } from '@/types'

const REPORTS = '/api/v1/reports'

/** Combined monthly dashboard across all of the user's books. */
export async function getMonthlyReport(
  year: number,
  month: number,
  signal?: AbortSignal,
): Promise<MonthlyReport> {
  const response = await apiClient.get<MonthlyReport>(`${REPORTS}/monthly/`, {
    params: { year, month },
    signal,
  })
  return response.data
}

/** Monthly overall budget with allocation progress, or `budget: null` when none exists. */
export async function getBudgetUtilization(
  year: number,
  month: number,
  signal?: AbortSignal,
): Promise<BudgetUtilizationReport> {
  const response = await apiClient.get<BudgetUtilizationReport>(
    `${REPORTS}/budget-utilization/`,
    { params: { year, month }, signal },
  )
  return response.data
}
