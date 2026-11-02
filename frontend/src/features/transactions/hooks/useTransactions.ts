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

export function useTransactionsList(params: TransactionListParams = {}) {
  return useQuery({
    queryKey: transactionKeys.list(params),
    queryFn: ({ signal }) => listTransactions(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useTransaction(id: string | undefined) {
  return useQuery({
    queryKey: transactionKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getTransaction(id as string, signal),
    enabled: Boolean(id),
  })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateTransactionPayload) => createTransaction(payload),
    onSuccess: (txn: Transaction) => {
      queryClient.setQueryData(transactionKeys.detail(txn.id), txn)
      void queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: bookKeys.all })
    },
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTransactionPayload }) =>
      updateTransaction(id, payload),
    onSuccess: (txn: Transaction) => {
      queryClient.setQueryData(transactionKeys.detail(txn.id), txn)
      void queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: bookKeys.all })
    },
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteTransaction(id),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: transactionKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: transactionKeys.lists() })
      void queryClient.invalidateQueries({ queryKey: bookKeys.all })
    },
  })
}
