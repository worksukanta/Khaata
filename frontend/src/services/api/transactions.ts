/**
 * Transactions service — API client functions for Transactions (API_CONTRACT.md §5).
 *
 * Endpoints:
 *   GET    /api/v1/transactions/        listTransactions
 *   POST   /api/v1/transactions/        createTransaction
 *   GET    /api/v1/transactions/{id}/   getTransaction
 *   PATCH  /api/v1/transactions/{id}/   updateTransaction
 *   DELETE /api/v1/transactions/{id}/   deleteTransaction (soft-delete, 204)
 */

import apiClient from './client'
import type {
  CreateTransactionPayload,
  PaginatedResponse,
  Transaction,
  TransactionListParams,
  UpdateTransactionPayload,
} from '@/types'

const TRANSACTIONS = '/api/v1/transactions'

function transactionPath(id: string): string {
  return `${TRANSACTIONS}/${encodeURIComponent(id)}`
}

/** List active transactions for the authenticated user (paginated). */
export async function listTransactions(
  params: TransactionListParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Transaction>> {
  const query: Record<string, string | number> = {}
  if (params.book_id) query.book_id = params.book_id
  if (params.type) query.type = params.type
  if (params.category_id) query.category_id = params.category_id
  if (params.payment_method_id) query.payment_method_id = params.payment_method_id
  if (params.date_from) query.date_from = params.date_from
  if (params.date_to) query.date_to = params.date_to
  const search = params.search?.trim()
  if (search) query.search = search
  if (params.ordering) query.ordering = params.ordering
  if (params.page !== undefined) query.page = params.page

  const response = await apiClient.get<PaginatedResponse<Transaction>>(`${TRANSACTIONS}/`, {
    params: query,
    signal,
  })
  return response.data
}

/** Create an INCOME or EXPENSE transaction. */
export async function createTransaction(
  payload: CreateTransactionPayload,
): Promise<Transaction> {
  const response = await apiClient.post<Transaction>(`${TRANSACTIONS}/`, payload)
  return response.data
}

/** Retrieve one active transaction. */
export async function getTransaction(
  id: string,
  signal?: AbortSignal,
): Promise<Transaction> {
  const response = await apiClient.get<Transaction>(`${transactionPath(id)}/`, {
    signal,
  })
  return response.data
}

/** Partially update an active transaction. */
export async function updateTransaction(
  id: string,
  payload: UpdateTransactionPayload,
): Promise<Transaction> {
  const response = await apiClient.patch<Transaction>(
    `${transactionPath(id)}/`,
    payload,
  )
  return response.data
}

/** Soft-delete an active transaction (idempotent, 204). */
export async function deleteTransaction(id: string): Promise<void> {
  await apiClient.delete(`${transactionPath(id)}/`)
}
