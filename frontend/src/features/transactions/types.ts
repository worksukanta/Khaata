/**
 * Types specific to the Transactions feature UI.
 */

import type { TransactionOrdering, TransactionType } from '@/types'

export interface TransactionFormValues {
  type: TransactionType
  amount: string
  transaction_date: string
  book_id: string
  category_id: string
  payment_method_id: string
  description: string
}

export type TransactionFormErrors = Partial<Record<keyof TransactionFormValues, string>> & {
  form?: string
}

export interface TransactionFilterState {
  type?: TransactionType | 'ALL'
  category_id?: string
  payment_method_id?: string
  date_from?: string
  date_to?: string
  search?: string
  ordering?: TransactionOrdering
  page?: number
}
