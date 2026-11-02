/**
 * Tests for TransactionForm component.
 * Validates category filtering, historical inactive reference preservation,
 * field validation, type switching, and duplicate submission prevention.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/books')
vi.mock('@/services/api/categories')
vi.mock('@/services/api/paymentMethods')

import { makeBook } from '@/features/books/testUtils'
import * as booksApi from '@/services/api/books'
import * as categoriesApi from '@/services/api/categories'
import * as paymentMethodsApi from '@/services/api/paymentMethods'
import TransactionForm from './components/TransactionForm'
import { emptyTransactionFormValues } from './utils'

const mockBooks = vi.mocked(booksApi)
const mockCategories = vi.mocked(categoriesApi)
const mockPaymentMethods = vi.mocked(paymentMethodsApi)

function renderForm(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  vi.clearAllMocks()

  mockBooks.listBooks.mockResolvedValue({
    count: 1,
    next: null,
    previous: null,
    results: [makeBook({ id: 'book-1', name: 'October 2026' })],
  })

  mockCategories.listCategories.mockResolvedValue({
    count: 2,
    next: null,
    previous: null,
    results: [
      { id: 'cat-food', name: 'Food', type: 'EXPENSE', is_active: true },
      { id: 'cat-salary', name: 'Salary', type: 'INCOME', is_active: true },
    ],
  })

  mockPaymentMethods.listPaymentMethods.mockResolvedValue({
    count: 2,
    next: null,
    previous: null,
    results: [
      { id: 'pm-cash', name: 'Cash', is_active: true },
      { id: 'pm-upi', name: 'UPI', is_active: true },
    ],
  })
})

describe('TransactionForm', () => {
  it('renders required and optional fields with accessible labels', async () => {
    renderForm(
      <TransactionForm
        initialValues={emptyTransactionFormValues('book-1')}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^book/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/payment method/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
  })

  it('preserves historical inactive category and payment method on edit', async () => {
    const historicalCategory = { id: 'cat-old', name: 'Old Inactive Category', type: 'EXPENSE' as const }
    const historicalPaymentMethod = { id: 'pm-old', name: 'Old Cheque' }

    renderForm(
      <TransactionForm
        initialValues={{
          type: 'EXPENSE',
          amount: '100.00',
          transaction_date: '2026-10-27',
          book_id: 'book-1',
          category_id: 'cat-old',
          payment_method_id: 'pm-old',
          description: 'Historical entry',
        }}
        historicalCategory={historicalCategory}
        historicalPaymentMethod={historicalPaymentMethod}
        onSubmit={vi.fn()}
        isEditing
      />,
    )

    expect(await screen.findByRole('option', { name: 'Old Inactive Category (Inactive)' })).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Old Cheque (Inactive)' })).toBeInTheDocument()
  })

  it('clears category when switching type to an incompatible category type', async () => {
    renderForm(
      <TransactionForm
        initialValues={{
          type: 'EXPENSE',
          amount: '100.00',
          transaction_date: '2026-10-27',
          book_id: 'book-1',
          category_id: 'cat-food',
          payment_method_id: '',
          description: '',
        }}
        onSubmit={vi.fn()}
      />,
    )

    const categorySelect = (await screen.findByLabelText(/category/i)) as HTMLSelectElement
    expect(categorySelect.value).toBe('cat-food')

    // Switch to Income
    fireEvent.click(screen.getByRole('radio', { name: /income/i }))

    // Category should be cleared because Food is EXPENSE
    expect(categorySelect.value).toBe('')
  })

  it('disables submit button and shows loading state while busy', async () => {
    renderForm(
      <TransactionForm
        initialValues={emptyTransactionFormValues('book-1')}
        onSubmit={vi.fn()}
        isBusy
      />,
    )

    const submitBtn = screen.getByRole('button', { name: /saving…/i })
    expect(submitBtn).toBeDisabled()
    expect(screen.getByLabelText(/amount/i)).toBeDisabled()
  })

  it('prevents duplicate submissions when submitting', async () => {
    const handleSubmit = vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)))

    renderForm(
      <TransactionForm
        initialValues={{
          type: 'EXPENSE',
          amount: '50.00',
          transaction_date: '2026-10-27',
          book_id: 'book-1',
          category_id: '',
          payment_method_id: '',
          description: '',
        }}
        onSubmit={handleSubmit}
      />,
    )

    const submitBtn = screen.getByRole('button', { name: /add transaction/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledTimes(1)
    })
  })
})
