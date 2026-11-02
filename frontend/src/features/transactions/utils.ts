/**
 * Pure helper functions for the Transactions feature.
 * Money formatting, form validation, date defaults, and payload transformations.
 * No React or side-effects.
 */

import { formatMoney } from '@/features/books/utils'
import type {
  Book,
  Category,
  CreateTransactionPayload,
  Transaction,
  TransactionType,
  UpdateTransactionPayload,
} from '@/types'
import type { TransactionFormErrors, TransactionFormValues } from './types'

export const DESCRIPTION_MAX_LENGTH = 500

/**
 * Returns today's ISO date (YYYY-MM-DD) in the specified IANA timezone,
 * falling back to local system time.
 */
export function getDefaultTransactionDate(
  timezone?: string,
  now: Date = new Date(),
): string {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now)
    const y = parts.find((p) => p.type === 'year')?.value
    const m = parts.find((p) => p.type === 'month')?.value
    const d = parts.find((p) => p.type === 'day')?.value
    if (y && m && d) return `${y}-${m}-${d}`
  } catch {
    // fallback
  }
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Initial blank form values for quick transaction creation. */
export function emptyTransactionFormValues(
  bookId = '',
  timezone?: string,
): TransactionFormValues {
  return {
    type: 'EXPENSE',
    amount: '',
    transaction_date: getDefaultTransactionDate(timezone),
    book_id: bookId,
    category_id: '',
    payment_method_id: '',
    description: '',
  }
}

/** Extract editable form values from an existing Transaction object. */
export function valuesFromTransaction(txn: Transaction): TransactionFormValues {
  return {
    type: txn.type,
    amount: txn.amount,
    transaction_date: txn.transaction_date,
    book_id: txn.book_id,
    category_id: txn.category?.id ?? '',
    payment_method_id: txn.payment_method?.id ?? '',
    description: txn.description ?? '',
  }
}

/**
 * Validate an amount string client-side.
 * Returns error string if invalid, undefined if valid.
 */
export function validateAmount(amount: string): string | undefined {
  const trimmed = amount.trim()
  if (!trimmed) {
    return 'Amount is required.'
  }

  // Must be positive decimal number with at most 2 decimal places
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return 'Please enter a valid amount with at most 2 decimal places.'
  }

  // Check for all zeros e.g. "0", "0.00", "00"
  if (/^0+(\.0+)?$/.test(trimmed)) {
    return 'Amount must be greater than zero.'
  }

  // Check integer part length (<= 12 integer digits per schema)
  const integerPart = trimmed.split('.')[0]
  if (integerPart.length > 12) {
    return 'Amount is too large.'
  }

  return undefined
}

/** Validate transaction form values before submission. */
export function validateTransactionForm(
  values: TransactionFormValues,
  books?: Book[],
  categories?: Category[],
): TransactionFormErrors {
  const errors: TransactionFormErrors = {}

  // Amount
  const amountError = validateAmount(values.amount)
  if (amountError) {
    errors.amount = amountError
  }

  // Date
  const date = values.transaction_date.trim()
  if (!date) {
    errors.transaction_date = 'Transaction date is required.'
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.transaction_date = 'Please enter a valid date (YYYY-MM-DD).'
  }

  // Book
  if (!values.book_id.trim()) {
    errors.book_id = 'Please select a book.'
  } else if (books) {
    const selectedBook = books.find((b) => b.id === values.book_id)
    if (selectedBook && selectedBook.is_archived) {
      errors.book_id = 'Cannot add transactions to an archived book.'
    }
  }

  // Category type consistency (if category is selected and categories list provided)
  if (values.category_id && categories) {
    const selectedCategory = categories.find((c) => c.id === values.category_id)
    if (selectedCategory && selectedCategory.type !== values.type) {
      errors.category_id = `Category type (${selectedCategory.type}) does not match transaction type (${values.type}).`
    }
  }

  // Description
  if (values.description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`
  }

  return errors
}

/** Transform valid form values into POST /transactions/ request payload. */
export function toCreateTransactionPayload(
  values: TransactionFormValues,
): CreateTransactionPayload {
  return {
    book_id: values.book_id.trim(),
    type: values.type,
    amount: values.amount.trim(),
    transaction_date: values.transaction_date.trim(),
    category_id: values.category_id.trim() || null,
    payment_method_id: values.payment_method_id.trim() || null,
    description: values.description.trim() || null,
  }
}

/** Transform valid form values into PATCH /transactions/{id}/ request payload. */
export function toUpdateTransactionPayload(
  values: TransactionFormValues,
): UpdateTransactionPayload {
  return {
    book_id: values.book_id.trim(),
    type: values.type,
    amount: values.amount.trim(),
    transaction_date: values.transaction_date.trim(),
    category_id: values.category_id.trim() || null,
    payment_method_id: values.payment_method_id.trim() || null,
    description: values.description.trim() || null,
  }
}

/**
 * Format a transaction amount for display with sign and symbol.
 * Example: Income 250.00 -> "+₹250.00", Expense 250.00 -> "-₹250.00"
 */
export function formatTransactionAmount(
  amount: string,
  type: TransactionType,
): {
  text: string
  sign: string
  formatted: string
  isIncome: boolean
} {
  const isIncome = type === 'INCOME'
  const sign = isIncome ? '+' : '-'
  const formatted = formatMoney(amount)
  return {
    text: `${sign}${formatted}`,
    sign,
    formatted,
    isIncome,
  }
}

/** Map backend field-level errors onto form fields. */
export function mapTransactionServerErrors(
  details: Record<string, string[] | string> | undefined,
): TransactionFormErrors {
  const errors: TransactionFormErrors = {}
  if (!details) return errors

  const fieldKeys: Array<keyof TransactionFormValues> = [
    'amount',
    'transaction_date',
    'book_id',
    'category_id',
    'payment_method_id',
    'description',
    'type',
  ]

  const leftovers: string[] = []

  for (const [key, raw] of Object.entries(details)) {
    const text = (Array.isArray(raw) ? raw : [raw]).join(' ')
    if ((fieldKeys as string[]).includes(key)) {
      errors[key as keyof TransactionFormValues] = text
    } else {
      leftovers.push(text)
    }
  }

  if (leftovers.length > 0) {
    errors.form = leftovers.join(' ')
  }

  return errors
}
