/**
 * Payment methods service — API client functions for Payment Methods (API_CONTRACT.md §4).
 *
 * Endpoints:
 *   GET /api/v1/payment-methods/   listPaymentMethods
 */

import apiClient from './client'
import type { PaginatedResponse, PaymentMethod, PaymentMethodListParams } from '@/types'

const PAYMENT_METHODS = '/api/v1/payment-methods'

/** List payment method labels for the authenticated user (paginated). */
export async function listPaymentMethods(
  params: PaymentMethodListParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<PaymentMethod>> {
  const query: Record<string, string | number | boolean> = {}
  if (params.is_active !== undefined) query.is_active = params.is_active
  const search = params.search?.trim()
  if (search) query.search = search
  if (params.page !== undefined) query.page = params.page

  const response = await apiClient.get<PaginatedResponse<PaymentMethod>>(
    `${PAYMENT_METHODS}/`,
    {
      params: query,
      signal,
    },
  )
  return response.data
}
