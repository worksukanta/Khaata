/**
 * TanStack Query hooks for Budgets.
 *
 * Query keys:
 *   ['budgets', 'list', params]   paginated lists (e.g. event budgets)
 *   ['budgets', 'detail', id]     single budget with derived figures
 *
 * Every successful mutation writes the returned budget into its detail entry
 * and invalidates ['budgets', 'list'] and the ['reports'] prefix (the dashboard
 * budget block and /reports/budget-utilization are derived from the budget).
 * Transaction mutations invalidate ['budgets'] and ['reports'] too, because
 * spending is derived from active transactions.
 */

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { reportKeys } from '@/features/dashboard/hooks/useReports'
import {
  createBudget,
  getBudget,
  listBudgets,
  replaceAllocations,
  updateBudget,
} from '@/services/api/budgets'
import type {
  AllocationInput,
  Budget,
  BudgetListParams,
  CreateBudgetPayload,
  UpdateBudgetPayload,
} from '@/types'

export const budgetKeys = {
  all: ['budgets'] as const,
  lists: () => ['budgets', 'list'] as const,
  list: (params: BudgetListParams) => ['budgets', 'list', params] as const,
  detail: (id: string) => ['budgets', 'detail', id] as const,
}

export function useBudgetsList(params: BudgetListParams = {}) {
  return useQuery({
    queryKey: budgetKeys.list(params),
    queryFn: ({ signal }) => listBudgets(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useBudget(id: string | undefined) {
  return useQuery({
    queryKey: budgetKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getBudget(id as string, signal),
    enabled: Boolean(id),
  })
}

function useCacheBudget() {
  const queryClient = useQueryClient()
  return (budget: Budget) => {
    queryClient.setQueryData(budgetKeys.detail(budget.id), budget)
    void queryClient.invalidateQueries({ queryKey: budgetKeys.lists() })
    void queryClient.invalidateQueries({ queryKey: reportKeys.all })
  }
}

export function useCreateBudget() {
  const cache = useCacheBudget()
  return useMutation({
    mutationFn: (payload: CreateBudgetPayload) => createBudget(payload),
    onSuccess: cache,
  })
}

export function useUpdateBudget() {
  const cache = useCacheBudget()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBudgetPayload }) =>
      updateBudget(id, payload),
    onSuccess: cache,
  })
}

export function useReplaceAllocations() {
  const cache = useCacheBudget()
  return useMutation({
    mutationFn: ({ id, allocations }: { id: string; allocations: AllocationInput[] }) =>
      replaceAllocations(id, allocations),
    onSuccess: cache,
  })
}
