/**
 * Tests for TransactionEditPage (/transactions/:id/edit).
 * Covers detail viewing, editing, monthly date move notice, archived book handling,
 * and soft deletion with confirmation dialog.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/books')
vi.mock('@/services/api/categories')
vi.mock('@/services/api/paymentMethods')
vi.mock('@/services/api/transactions')

import { makeBook, makeMonthlyBook } from '@/features/books/testUtils'
import * as transactionsApi from '@/services/api/transactions'
import {
  apiError,
  installFakeTransactionBackend,
  makeCategory,
  makePaymentMethod,
  makeTransaction,
  renderTransactionsApp,
} from './testUtils'

const TXN_ID = '11111111-2222-4333-8444-555555555555'
const BOOK_ID = '22222222-3333-4444-8555-666666666666'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('TransactionEditPage', () => {
  it('shows not found for invalid UUID', async () => {
    installFakeTransactionBackend()
    renderTransactionsApp('/transactions/not-a-uuid/edit')
    expect(await screen.findByRole('heading', { name: /transaction not found/i })).toBeInTheDocument()
  })

  it('shows not found when API returns 404', async () => {
    installFakeTransactionBackend()
    renderTransactionsApp(`/transactions/${TXN_ID}/edit`)
    expect(await screen.findByRole('heading', { name: /transaction not found/i })).toBeInTheDocument()
  })

  it('prefills existing transaction details on load', async () => {
    const book = makeBook({ id: BOOK_ID, name: 'October 2026' })
    const foodCat = makeCategory({ id: 'cat-food', name: 'Food', type: 'EXPENSE' })
    const upiPm = makePaymentMethod({ id: 'pm-upi', name: 'UPI' })
    const txn = makeTransaction({
      id: TXN_ID,
      book_id: BOOK_ID,
      type: 'EXPENSE',
      amount: '350.00',
      transaction_date: '2026-10-27',
      category: { id: 'cat-food', name: 'Food', type: 'EXPENSE' },
      payment_method: { id: 'pm-upi', name: 'UPI' },
      description: 'Dinner treat',
    })

    installFakeTransactionBackend({
      books: [book],
      categories: [foodCat],
      paymentMethods: [upiPm],
      transactions: [txn],
    })

    renderTransactionsApp(`/transactions/${TXN_ID}/edit`)

    expect(await screen.findByRole('heading', { name: /edit transaction/i })).toBeInTheDocument()
    expect((screen.getByLabelText(/amount/i) as HTMLInputElement).value).toBe('350.00')
    expect((screen.getByLabelText(/date/i) as HTMLInputElement).value).toBe('2026-10-27')
    expect((screen.getByLabelText(/^book/i) as HTMLSelectElement).value).toBe(BOOK_ID)
    expect((screen.getByLabelText(/category/i) as HTMLSelectElement).value).toBe('cat-food')
    expect((screen.getByLabelText(/payment method/i) as HTMLSelectElement).value).toBe('pm-upi')
    expect((screen.getByLabelText(/description/i) as HTMLTextAreaElement).value).toBe('Dinner treat')
  })

  it('successfully updates transaction and navigates back to book', async () => {
    const book = makeBook({ id: BOOK_ID, name: 'General Book' })
    const txn = makeTransaction({
      id: TXN_ID,
      book_id: BOOK_ID,
      amount: '100.00',
      description: 'Original note',
    })

    const backend = installFakeTransactionBackend({
      books: [book],
      transactions: [txn],
    })

    renderTransactionsApp(`/transactions/${TXN_ID}/edit`)

    await screen.findByRole('heading', { name: /edit transaction/i })

    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '150.00' } })
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Updated note' } })

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(backend.transactions[0].amount).toBe('150.00')
      expect(backend.transactions[0].description).toBe('Updated note')
      expect(screen.getByTestId('location').textContent).toBe(`/books/${BOOK_ID}`)
    })
  })

  it('displays notice when changing the month of a monthly book transaction', async () => {
    const monthlyBook = makeMonthlyBook(2026, 10, { id: BOOK_ID })
    const txn = makeTransaction({
      id: TXN_ID,
      book_id: BOOK_ID,
      transaction_date: '2026-10-15',
    })

    installFakeTransactionBackend({
      books: [monthlyBook],
      transactions: [txn],
    })

    renderTransactionsApp(`/transactions/${TXN_ID}/edit`)

    await screen.findByRole('heading', { name: /edit transaction/i })
    expect(screen.queryByText(/changing the month on this monthly transaction/i)).not.toBeInTheDocument()

    // Change date to November
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-11-05' } })

    expect(await screen.findByText(/changing the month on this monthly transaction/i)).toBeInTheDocument()
  })

  it('renders read-only view when transaction belongs to an archived book', async () => {
    const archivedBook = makeBook({ id: BOOK_ID, name: 'Archived Event', is_archived: true })
    const txn = makeTransaction({
      id: TXN_ID,
      book_id: BOOK_ID,
      amount: '500.00',
    })

    installFakeTransactionBackend({
      books: [archivedBook],
      transactions: [txn],
    })

    renderTransactionsApp(`/transactions/${TXN_ID}/edit`)

    expect(await screen.findByRole('heading', { name: /transaction details/i })).toBeInTheDocument()
    expect(screen.getByText(/belongs to an archived book and cannot be edited/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/amount/i)).toBeDisabled()
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
  })

  it('opens delete confirmation dialog and performs soft deletion', async () => {
    const book = makeBook({ id: BOOK_ID, name: 'General Book' })
    const txn = makeTransaction({
      id: TXN_ID,
      book_id: BOOK_ID,
      amount: '200.00',
      description: 'Coffee',
    })

    const backend = installFakeTransactionBackend({
      books: [book],
      transactions: [txn],
    })

    renderTransactionsApp(`/transactions/${TXN_ID}/edit`)

    await screen.findByRole('heading', { name: /edit transaction/i })

    const deleteBtn = screen.getByRole('button', { name: /^delete$/i })
    fireEvent.click(deleteBtn)

    // Modal appears
    expect(await screen.findByRole('heading', { name: /delete transaction/i })).toBeInTheDocument()
    expect(screen.getByText(/are you sure you want to delete this expense entry/i)).toBeInTheDocument()

    // Cancel closes dialog
    fireEvent.click(screen.getByTestId('delete-dialog-cancel'))
    expect(screen.queryByRole('heading', { name: /delete transaction/i })).not.toBeInTheDocument()

    // Open again and confirm
    fireEvent.click(deleteBtn)
    const confirmDeleteBtn = await screen.findByRole('button', { name: /delete transaction/i })
    fireEvent.click(confirmDeleteBtn)

    await waitFor(() => {
      expect(backend.transactions).toHaveLength(0)
      expect(screen.getByTestId('location').textContent).toBe(`/books/${BOOK_ID}`)
    })
  })

  it('shows error message if delete API fails', async () => {
    const book = makeBook({ id: BOOK_ID, name: 'General Book' })
    const txn = makeTransaction({ id: TXN_ID, book_id: BOOK_ID })

    installFakeTransactionBackend({
      books: [book],
      transactions: [txn],
    })

    const mockedTxns = vi.mocked(transactionsApi)
    mockedTxns.deleteTransaction.mockRejectedValueOnce(
      apiError('server_error', 'Cannot delete at this time.'),
    )

    renderTransactionsApp(`/transactions/${TXN_ID}/edit`)

    await screen.findByRole('heading', { name: /edit transaction/i })
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    const confirmDeleteBtn = await screen.findByRole('button', { name: /delete transaction/i })
    fireEvent.click(confirmDeleteBtn)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })
})
