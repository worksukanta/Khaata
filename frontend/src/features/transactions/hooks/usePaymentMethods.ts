/**
 * TanStack Query hooks for Payment Methods.
 */

import { useQuery } from '@tanstack/react-query'
import { listPaymentMethods } from '@/services/api/paymentMethods'
import type { PaymentMethodListParams } from '@/types'

export const paymentMethodKeys = {
  all: ['payment-methods'] as const,
  lists: () => ['payment-methods', 'list'] as const,
  list: (params: PaymentMethodListParams) => ['payment-methods', 'list', params] as const,
}

export function usePaymentMethodsList(params: PaymentMethodListParams = {}) {
  return useQuery({
    queryKey: paymentMethodKeys.list(params),
    queryFn: ({ signal }) => listPaymentMethods(params, signal),
    staleTime: 5 * 60 * 1000,
  })
}
