/**
 * Unit tests for transactions utility functions.
 */

import { describe, expect, it } from 'vitest'
import type { Book, Category, Transaction } from '@/types'
import {
  formatTransactionAmount,
  getDefaultTransactionDate,
  mapTransactionServerErrors,
  toCreateTransactionPayload,
  toUpdateTransactionPayload,
  validateAmount,
  validateTransactionForm,
  valuesFromTransaction,
} from './utils'

describe('getDefaultTransactionDate', () => {
  it('formats current date as YYYY-MM-DD in specified timezone', () => {
    const fixedDate = new Date('2026-10-27T18:30:00Z')
    const result = getDefaultTransactionDate('Asia/Kolkata', fixedDate)
    expect(result).toBe('2026-10-28')
  })

  it('falls back gracefully on invalid timezone', () => {
    const fixedDate = new Date('2026-10-27T12:00:00Z')
    const result = getDefaultTransactionDate('Invalid/Timezone', fixedDate)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('validateAmount', () => {
  it('accepts valid integers and 2-decimal numbers', () => {
    expect(validateAmount('100')).toBeUndefined()
    expect(validateAmount('100.5')).toBeUndefined()
    expect(validateAmount('100.50')).toBeUndefined()
    expect(validateAmount('0.05')).toBeUndefined()
    expect(validateAmount('999999999999.99')).toBeUndefined()
  })

  it('rejects empty, negative, zero, and malformed amounts', () => {
    expect(validateAmount('')).toBe('Amount is required.')
    expect(validateAmount('   ')).toBe('Amount is required.')
    expect(validateAmount('0')).toBe('Amount must be greater than zero.')
    expect(validateAmount('0.00')).toBe('Amount must be greater than zero.')
    expect(validateAmount('-50')).toBe('Please enter a valid amount with at most 2 decimal places.')
    expect(validateAmount('100.123')).toBe('Please enter a valid amount with at most 2 decimal places.')
    expect(validateAmount('abc')).toBe('Please enter a valid amount with at most 2 decimal places.')
    expect(validateAmount('10000000000000')).toBe('Amount is too large.')
  })
})

describe('validateTransactionForm', () => {
  const books: Book[] = [
    {
      id: 'book-1',
      type: 'MONTHLY',
      name: 'October 2026',
      opening_balance: '0.00',
      is_archived: false,
      created_at: '',
      updated_at: '',
    },
    {
      id: 'book-archived',
      type: 'EVENT',
      name: 'Old Event',
      opening_balance: '0.00',
      is_archived: true,
      created_at: '',
      updated_at: '',
    },
  ]

  const categories: Category[] = [
    { id: 'cat-income', name: 'Salary', type: 'INCOME', is_active: true },
    { id: 'cat-expense', name: 'Food', type: 'EXPENSE', is_active: true },
  ]

  it('passes on valid form values', () => {
    const errors = validateTransactionForm(
      {
        type: 'EXPENSE',
        amount: '150.00',
        transaction_date: '2026-10-27',
        book_id: 'book-1',
        category_id: 'cat-expense',
        payment_method_id: '',
        description: 'Snacks',
      },
      books,
      categories,
    )
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('rejects missing book and missing date', () => {
    const errors = validateTransactionForm({
      type: 'EXPENSE',
      amount: '150.00',
      transaction_date: '',
      book_id: '',
      category_id: '',
      payment_method_id: '',
      description: '',
    })
    expect(errors.book_id).toBe('Please select a book.')
    expect(errors.transaction_date).toBe('Transaction date is required.')
  })

  it('rejects archived book', () => {
    const errors = validateTransactionForm(
      {
        type: 'EXPENSE',
        amount: '150.00',
        transaction_date: '2026-10-27',
        book_id: 'book-archived',
        category_id: '',
        payment_method_id: '',
        description: '',
      },
      books,
    )
    expect(errors.book_id).toBe('Cannot add transactions to an archived book.')
  })

  it('rejects category type mismatch', () => {
    const errors = validateTransactionForm(
      {
        type: 'EXPENSE',
        amount: '150.00',
        transaction_date: '2026-10-27',
        book_id: 'book-1',
        category_id: 'cat-income',
        payment_method_id: '',
        description: '',
      },
      books,
      categories,
    )
    expect(errors.category_id).toContain('does not match transaction type')
  })
})

describe('payload transformations', () => {
  it('converts form values to create and update payloads', () => {
    const values = {
      type: 'INCOME' as const,
      amount: '50000.00',
      transaction_date: '2026-10-01',
      book_id: 'book-1',
      category_id: 'cat-income',
      payment_method_id: '',
      description: 'Monthly salary',
    }

    const createPayload = toCreateTransactionPayload(values)
    expect(createPayload).toEqual({
      book_id: 'book-1',
      type: 'INCOME',
      amount: '50000.00',
      transaction_date: '2026-10-01',
      category_id: 'cat-income',
      payment_method_id: null,
      description: 'Monthly salary',
    })

    const updatePayload = toUpdateTransactionPayload(values)
    expect(updatePayload).toEqual({
      book_id: 'book-1',
      type: 'INCOME',
      amount: '50000.00',
      transaction_date: '2026-10-01',
      category_id: 'cat-income',
      payment_method_id: null,
      description: 'Monthly salary',
    })
  })

  it('populates form values from transaction object', () => {
    const txn: Transaction = {
      id: 'txn-1',
      book_id: 'book-1',
      type: 'EXPENSE',
      amount: '250.00',
      transaction_date: '2026-10-27',
      category: { id: 'cat-1', name: 'Food', type: 'EXPENSE' },
      payment_method: null,
      description: 'Tea',
      created_at: '',
      updated_at: '',
    }

    const values = valuesFromTransaction(txn)
    expect(values).toEqual({
      type: 'EXPENSE',
      amount: '250.00',
      transaction_date: '2026-10-27',
      book_id: 'book-1',
      category_id: 'cat-1',
      payment_method_id: '',
      description: 'Tea',
    })
  })
})

describe('formatTransactionAmount', () => {
  it('formats income with + and formatted money string', () => {
    const result = formatTransactionAmount('1000.00', 'INCOME')
    expect(result.text).toBe('+₹1,000.00')
    expect(result.isIncome).toBe(true)
    expect(result.sign).toBe('+')
  })

  it('formats expense with - and formatted money string', () => {
    const result = formatTransactionAmount('250.00', 'EXPENSE')
    expect(result.text).toBe('-₹250.00')
    expect(result.isIncome).toBe(false)
    expect(result.sign).toBe('-')
  })
})

describe('mapTransactionServerErrors', () => {
  it('maps recognized fields and catches leftovers in form error', () => {
    const serverDetails = {
      amount: ['Ensure this value is greater than zero.'],
      book_id: ['Book is archived.'],
      non_field_errors: ['Something went wrong with the transaction.'],
    }

    const errors = mapTransactionServerErrors(serverDetails)
    expect(errors.amount).toBe('Ensure this value is greater than zero.')
    expect(errors.book_id).toBe('Book is archived.')
    expect(errors.form).toBe('Something went wrong with the transaction.')
  })
})
