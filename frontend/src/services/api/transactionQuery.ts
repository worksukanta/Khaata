/**
 * Shared query-string builder for the transaction filter parameters used by
 * both GET /transactions/ and GET /exports/transactions.csv (API_CONTRACT.md
 * §5 and §8: the export applies "the same filter semantics as the list").
 *
 * Only supplied, non-empty filters are sent.
 */

import type { TransactionListParams } from '@/types'

export function buildTransactionFilterQuery(
  params: TransactionListParams,
): Record<string, string | number> {
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
  return query
}
