/**
 * Budgets service — thin wrappers around the Budgets API (API_CONTRACT.md §6).
 *
 * Endpoints:
 *   GET   /api/v1/budgets/                  listBudgets
 *   POST  /api/v1/budgets/                  createBudget (MONTHLY_OVERALL | EVENT)
 *   GET   /api/v1/budgets/{id}/             getBudget
 *   PATCH /api/v1/budgets/{id}/             updateBudget (total_limit)
 *   PUT   /api/v1/budgets/{id}/allocations/ replaceAllocations (atomic full replacement)
 *
 * The backend defines no DELETE for budgets.
 */

import apiClient from './client'
import type {
  AllocationInput,
  Budget,
  BudgetListParams,
  CreateBudgetPayload,
  PaginatedResponse,
  UpdateBudgetPayload,
} from '@/types'

const BUDGETS = '/api/v1/budgets'

function budgetPath(id: string): string {
  return `${BUDGETS}/${encodeURIComponent(id)}`
}

/** List the authenticated user's budgets (paginated). Only supplied filters are sent. */
export async function listBudgets(
  params: BudgetListParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Budget>> {
  const query: Record<string, string | number> = {}
  if (params.scope) query.scope = params.scope
  if (params.year !== undefined) query.year = params.year
  if (params.month !== undefined) query.month = params.month
  if (params.book_id) query.book_id = params.book_id
  if (params.page !== undefined) query.page = params.page

  const response = await apiClient.get<PaginatedResponse<Budget>>(`${BUDGETS}/`, {
    params: query,
    signal,
  })
  return response.data
}

/** Create a monthly overall or event budget. */
export async function createBudget(payload: CreateBudgetPayload): Promise<Budget> {
  const response = await apiClient.post<Budget>(`${BUDGETS}/`, payload)
  return response.data
}

/** Retrieve one budget with derived spending figures. */
export async function getBudget(id: string, signal?: AbortSignal): Promise<Budget> {
  const response = await apiClient.get<Budget>(`${budgetPath(id)}/`, { signal })
  return response.data
}

/** Partially update a budget (the UI only changes `total_limit`). */
export async function updateBudget(
  id: string,
  payload: UpdateBudgetPayload,
): Promise<Budget> {
  const response = await apiClient.patch<Budget>(`${budgetPath(id)}/`, payload)
  return response.data
}

/** Atomically replace every category allocation; an empty list clears them all. */
export async function replaceAllocations(
  id: string,
  allocations: AllocationInput[],
): Promise<Budget> {
  const response = await apiClient.put<Budget>(`${budgetPath(id)}/allocations/`, {
    allocations,
  })
  return response.data
}
