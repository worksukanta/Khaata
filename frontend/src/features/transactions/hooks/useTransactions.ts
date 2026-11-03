/**
 * TanStack Query hooks for Transactions (list, detail, create, update, delete).
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { bookKeys } from '@/features/books/hooks/useBooks'
import { budgetKeys } from '@/features/budgets/hooks/useBudgets'
import { reportKeys } from '@/features/dashboard/hooks/useReports'
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from '@/services/api/transactions'
import type {
  CreateTransactionPayload,
  Transaction,
  TransactionListParams,
  UpdateTransactionPayload,
} from '@/types'

export const transactionKeys = {
  all: ['transactions'] as const,
  lists: () => ['transactions', 'list'] as const,
  list: (params: TransactionListParams) => ['transactions', 'list', params] as const,
  details: () => ['transactions', 'detail'] as const,
  detail: (id: string) => ['transactions', 'detail', id] as const,
}

export function useTransactionsList(
  params: TransactionListParams = {},
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: transactionKeys.list(params),
    queryFn: ({ signal }) => listTransactions(params, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  })
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: transactionKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getTransaction(id as string, signal),
    enabled: Boolean(id),
  })
}

/**
 * Spending, totals and budget figures are derived from active transactions on
 * the server, so every transaction write also invalidates budgets and reports.
 */
function useInvalidateDerived() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
    void queryClient.invalidateQueries({ queryKey: bookKeys.all })
    void queryClient.invalidateQueries({ queryKey: budgetKeys.all })
    void queryClient.invalidateQueries({ queryKey: reportKeys.all })
  }
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  const invalidateDerived = useInvalidateDerived()
  return useMutation({
    mutationFn: (payload: CreateTransactionPayload) => createTransaction(payload),
    onSuccess: (txn: Transaction) => {
      queryClient.setQueryData(transactionKeys.detail(txn.id), txn)
      invalidateDerived()
    },
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  const invalidateDerived = useInvalidateDerived()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTransactionPayload }) =>
      updateTransaction(id, payload),
    onSuccess: (txn: Transaction) => {
      queryClient.setQueryData(transactionKeys.detail(txn.id), txn)
      invalidateDerived()
    },
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  const invalidateDerived = useInvalidateDerived()
  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: transactionKeys.detail(id) })
      invalidateDerived()
    },
  })
}
