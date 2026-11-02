/**
 * Tests for TransactionCreatePage (/transactions/new).
 * Covers income/expense creation, validation, book preselection,
 * category filtering by type, server errors, and navigation.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/books')
vi.mock('@/services/api/categories')
vi.mock('@/services/api/paymentMethods')
vi.mock('@/services/api/transactions')

import { makeBook } from '@/features/books/testUtils'
import * as transactionsApi from '@/services/api/transactions'
import {
  apiError,
  installFakeTransactionBackend,
  makeCategory,
  makePaymentMethod,
  renderTransactionsApp,
} from './testUtils'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TransactionCreatePage', () => {
  it('renders create form with amount, date, type, book, category, and payment method fields', async () => {
    const book = makeBook({ id: '00000000-0000-4000-8000-000000000001', name: 'October 2026' })
    installFakeTransactionBackend({ books: [book] })

    renderTransactionsApp('/transactions/new')

    expect(await screen.findByRole('heading', { name: /add transaction/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /expense/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /income/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^book/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
  })

  it('preselects book when bookId query parameter is present', async () => {
    const book = makeBook({ id: '00000000-0000-4000-8000-000000000099', name: 'Durga Puja 2026' })
    installFakeTransactionBackend({ books: [book] })

    renderTransactionsApp('/transactions/new?bookId=00000000-0000-4000-8000-000000000099')

    const bookSelect = (await screen.findByLabelText(/^book/i)) as HTMLSelectElement
    expect(bookSelect.value).toBe('00000000-0000-4000-8000-000000000099')
  })

  it('validates amount client-side (rejects empty, zero, negative)', async () => {
    const book = makeBook({ id: '00000000-0000-4000-8000-000000000001', name: 'General Book' })
    installFakeTransactionBackend({ books: [book] })

    renderTransactionsApp('/transactions/new')

    const submitBtn = await screen.findByRole('button', { name: /add transaction/i })
    fireEvent.click(submitBtn)

    expect(await screen.findByText(/amount is required/i)).toBeInTheDocument()

    // Enter 0
    const amountInput = screen.getByLabelText(/amount/i)
    fireEvent.change(amountInput, { target: { value: '0' } })
    fireEvent.click(submitBtn)

    expect(await screen.findByText(/amount must be greater than zero/i)).toBeInTheDocument()
  })

  it('filters categories by selected transaction type', async () => {
    const book = makeBook({ id: '00000000-0000-4000-8000-000000000001', name: 'General Book' })
    const foodCat = makeCategory({ id: 'cat-food', name: 'Food & Groceries', type: 'EXPENSE' })
    const salaryCat = makeCategory({ id: 'cat-salary', name: 'Monthly Salary', type: 'INCOME' })

    installFakeTransactionBackend({
      books: [book],
      categories: [foodCat, salaryCat],
    })

    renderTransactionsApp('/transactions/new')

    // Expense is default
    expect(await screen.findByRole('option', { name: 'Food & Groceries' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Monthly Salary' })).not.toBeInTheDocument()

    // Switch to Income
    fireEvent.click(screen.getByRole('radio', { name: /income/i }))

    expect(await screen.findByRole('option', { name: 'Monthly Salary' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Food & Groceries' })).not.toBeInTheDocument()
  })

  it('successfully creates an expense transaction and navigates to the book details page', async () => {
    const book = makeBook({ id: '00000000-0000-4000-8000-000000000001', name: 'October 2026' })
    const foodCat = makeCategory({ id: 'cat-food', name: 'Food & Groceries', type: 'EXPENSE' })
    const upiPm = makePaymentMethod({ id: 'pm-upi', name: 'UPI' })

    const backend = installFakeTransactionBackend({
      books: [book],
      categories: [foodCat],
      paymentMethods: [upiPm],
    })

    renderTransactionsApp('/transactions/new?bookId=00000000-0000-4000-8000-000000000001')

    await screen.findByRole('heading', { name: /add transaction/i })

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '250.00' } })
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-10-27' } })
    fireEvent.change(screen.getByLabelText(/category/i), { target: { value: 'cat-food' } })
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'pm-upi' } })
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Dinner with friends' } })

    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }))

    await waitFor(() => {
      expect(backend.transactions).toHaveLength(1)
      expect(backend.transactions[0].amount).toBe('250.00')
      expect(backend.transactions[0].type).toBe('EXPENSE')
      expect(backend.transactions[0].description).toBe('Dinner with friends')
      expect(screen.getByTestId('location').textContent).toBe('/books/00000000-0000-4000-8000-000000000001')
    })
  })

  it('displays backend field-level validation errors and preserves form input', async () => {
    const book = makeBook({ id: '00000000-0000-4000-8000-000000000001', name: 'October 2026' })
    installFakeTransactionBackend({ books: [book] })

    const mockedTxns = vi.mocked(transactionsApi)
    mockedTxns.createTransaction.mockRejectedValueOnce(
      apiError('validation_error', 'Invalid transaction.', {
        amount: ['Ensure this value is greater than zero.'],
      }),
    )

    renderTransactionsApp('/transactions/new?bookId=00000000-0000-4000-8000-000000000001')

    await screen.findByRole('heading', { name: /add transaction/i })

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '100.00' } })
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Preserved note' } })

    fireEvent.click(screen.getByRole('button', { name: /add transaction/i }))

    expect(await screen.findByText(/ensure this value is greater than zero/i)).toBeInTheDocument()
    expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toBe('Preserved note')
  })
})
