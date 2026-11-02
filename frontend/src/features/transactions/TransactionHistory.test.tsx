/**
 * Tests for Transaction History and Filtering on BookDetailsPage.
 */

import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/books')
vi.mock('@/services/api/categories')
vi.mock('@/services/api/paymentMethods')
vi.mock('@/services/api/transactions')

import { makeBook } from '@/features/books/testUtils'
import {
  installFakeTransactionBackend,
  makeCategory,
  makePaymentMethod,
  makeTransaction,
  renderTransactionsApp,
} from './testUtils'

const BOOK_ID = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Transaction History on BookDetailsPage', () => {
  it('renders transactions list with income/expense amounts and badges', async () => {
    const book = makeBook({ id: BOOK_ID, name: 'October 2026' })
    const foodCat = makeCategory({ id: 'cat-food', name: 'Food', type: 'EXPENSE' })
    const salaryCat = makeCategory({ id: 'cat-salary', name: 'Salary', type: 'INCOME' })
    const upiPm = makePaymentMethod({ id: 'pm-upi', name: 'UPI' })

    const txn1 = makeTransaction({
      id: 'txn-1',
      book_id: BOOK_ID,
      type: 'EXPENSE',
      amount: '120.00',
      transaction_date: '2026-10-25',
      category: foodCat,
      payment_method: upiPm,
      description: 'Breakfast',
    })

    const txn2 = makeTransaction({
      id: 'txn-2',
      book_id: BOOK_ID,
      type: 'INCOME',
      amount: '50000.00',
      transaction_date: '2026-10-01',
      category: salaryCat,
      payment_method: null,
      description: 'Monthly Salary',
    })

    installFakeTransactionBackend({
      books: [book],
      categories: [foodCat, salaryCat],
      paymentMethods: [upiPm],
      transactions: [txn1, txn2],
    })

    renderTransactionsApp(`/books/${BOOK_ID}`)

    expect(await screen.findByText('Transactions')).toBeInTheDocument()
    expect(screen.getByText('-₹120.00')).toBeInTheDocument()
    expect(screen.getByText('+₹50,000.00')).toBeInTheDocument()
    expect(screen.getByText('Breakfast')).toBeInTheDocument()
    expect(screen.getByText('Monthly Salary')).toBeInTheDocument()
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('Salary')).toBeInTheDocument()
  })

  it('renders empty state when there are no transactions in the book', async () => {
    const book = makeBook({ id: BOOK_ID, name: 'Empty Book' })
    installFakeTransactionBackend({
      books: [book],
      transactions: [],
    })

    renderTransactionsApp(`/books/${BOOK_ID}`)

    expect(await screen.findByText('No transactions yet')).toBeInTheDocument()
    expect(screen.getByText('Add your first income or expense entry to start tracking.')).toBeInTheDocument()
  })

  it('filters transactions by search keyword and type', async () => {
    const book = makeBook({ id: BOOK_ID, name: 'Trip' })
    const txn1 = makeTransaction({
      id: 'txn-1',
      book_id: BOOK_ID,
      type: 'EXPENSE',
      amount: '500.00',
      description: 'Train ticket',
    })
    const txn2 = makeTransaction({
      id: 'txn-2',
      book_id: BOOK_ID,
      type: 'EXPENSE',
      amount: '200.00',
      description: 'Hotel snacks',
    })

    installFakeTransactionBackend({
      books: [book],
      transactions: [txn1, txn2],
    })

    renderTransactionsApp(`/books/${BOOK_ID}`)

    expect(await screen.findByText('Train ticket')).toBeInTheDocument()
    expect(screen.getByText('Hotel snacks')).toBeInTheDocument()

    // Toggle filters open
    fireEvent.click(screen.getByRole('button', { name: /filters/i }))

    // Search for "train"
    const searchInput = screen.getByLabelText(/search notes/i)
    fireEvent.change(searchInput, { target: { value: 'train' } })

    await waitFor(() => {
      expect(screen.getByText('Train ticket')).toBeInTheDocument()
      expect(screen.queryByText('Hotel snacks')).not.toBeInTheDocument()
    })

    // Search for something with no matches
    fireEvent.change(searchInput, { target: { value: 'nonexistent' } })

    expect(await screen.findByText('No matching transactions')).toBeInTheDocument()
    const clearBtns = screen.getAllByRole('button', { name: /clear filters/i })
    expect(clearBtns.length).toBeGreaterThan(0)

    // Clear filters restores all
    fireEvent.click(clearBtns[0])
    expect(await screen.findByText('Train ticket')).toBeInTheDocument()
    expect(screen.getByText('Hotel snacks')).toBeInTheDocument()
  })

  it('renders historical transactions in archived book without Add button', async () => {
    const archivedBook = makeBook({ id: BOOK_ID, name: 'Archived Puja', is_archived: true })
    const txn = makeTransaction({
      id: 'txn-1',
      book_id: BOOK_ID,
      amount: '1000.00',
      description: 'Pandal lights',
    })

    installFakeTransactionBackend({
      books: [archivedBook],
      transactions: [txn],
    })

    renderTransactionsApp(`/books/${BOOK_ID}`)

    expect(await screen.findByText('Pandal lights')).toBeInTheDocument()
    expect(screen.getByText('-₹1,000.00')).toBeInTheDocument()
    // Add transaction button must not be present in archived book
    expect(screen.queryByRole('link', { name: /\+ add transaction/i })).not.toBeInTheDocument()
  })
})
