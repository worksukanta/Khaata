/* eslint-disable react-refresh/only-export-components -- test helper module, not a component boundary */
/**
 * Shared test helpers for the Transactions feature.
 */

import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Toast'
import BookDetailsPage from '@/features/books/BookDetailsPage'
import BooksPage from '@/features/books/BooksPage'
import { makeBook } from '@/features/books/testUtils'
import TransactionCreatePage from './TransactionCreatePage'
import TransactionEditPage from './TransactionEditPage'
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: '00000000-0000-4000-8000-000000000001',
      email: 'user@example.com',
      display_name: 'Test User',
      timezone: 'Asia/Kolkata',
    },
    initializing: false,
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
  }),
}))

import * as booksApi from '@/services/api/books'
import * as categoriesApi from '@/services/api/categories'
import * as paymentMethodsApi from '@/services/api/paymentMethods'
import * as transactionsApi from '@/services/api/transactions'
import type {
  ApiError,
  Book,
  Category,
  PaymentMethod,
  Transaction,
} from '@/types'

let counter = 0

export function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  counter += 1
  const n = String(counter).padStart(12, '0')
  return {
    id: `10000000-0000-4000-8000-${n}`,
    book_id: '00000000-0000-4000-8000-000000000001',
    type: 'EXPENSE',
    amount: '150.00',
    transaction_date: '2026-10-27',
    category: {
      id: '20000000-0000-4000-8000-000000000001',
      name: 'Food & Dining',
      type: 'EXPENSE',
    },
    payment_method: {
      id: '30000000-0000-4000-8000-000000000001',
      name: 'UPI',
    },
    description: `Transaction ${counter}`,
    created_at: '2026-10-27T10:00:00Z',
    updated_at: '2026-10-27T10:00:00Z',
    ...overrides,
  }
}

export function makeCategory(overrides: Partial<Category> = {}): Category {
  counter += 1
  const n = String(counter).padStart(12, '0')
  return {
    id: `20000000-0000-4000-8000-${n}`,
    name: `Category ${counter}`,
    type: 'EXPENSE',
    is_default: false,
    is_active: true,
    ...overrides,
  }
}

export function makePaymentMethod(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  counter += 1
  const n = String(counter).padStart(12, '0')
  return {
    id: `30000000-0000-4000-8000-${n}`,
    name: `Payment Method ${counter}`,
    is_active: true,
    ...overrides,
  }
}

export function apiError(
  code: string,
  message: string,
  details?: Record<string, string[]>,
): ApiError {
  return { error: { code, message, ...(details ? { details } : {}) } }
}

export interface FakeBackend {
  books: Book[]
  transactions: Transaction[]
  categories: Category[]
  paymentMethods: PaymentMethod[]
}

export function installFakeTransactionBackend(
  initial: {
    books?: Book[]
    transactions?: Transaction[]
    categories?: Category[]
    paymentMethods?: PaymentMethod[]
  } = {},
): FakeBackend {
  const state: FakeBackend = {
    books: (initial.books ?? [makeBook()]).map((b) => ({ ...b })),
    transactions: (initial.transactions ?? []).map((t) => ({ ...t })),
    categories: (initial.categories ?? [
      makeCategory({ id: 'cat-food', name: 'Food', type: 'EXPENSE', is_active: true }),
      makeCategory({ id: 'cat-salary', name: 'Salary', type: 'INCOME', is_active: true }),
    ]).map((c) => ({ ...c })),
    paymentMethods: (initial.paymentMethods ?? [
      makePaymentMethod({ id: 'pm-cash', name: 'Cash', is_active: true }),
      makePaymentMethod({ id: 'pm-upi', name: 'UPI', is_active: true }),
    ]).map((p) => ({ ...p })),
  }

  const mockedBooks = vi.mocked(booksApi)
  const mockedTxns = vi.mocked(transactionsApi)
  const mockedCats = vi.mocked(categoriesApi)
  const mockedPms = vi.mocked(paymentMethodsApi)

  // Books mocks
  mockedBooks.listBooks.mockImplementation(async (params = {}) => {
    let rows = state.books.filter((b) => !params.type || b.type === params.type)
    if (params.is_archived !== undefined) {
      rows = rows.filter((b) => b.is_archived === params.is_archived)
    }
    return { count: rows.length, next: null, previous: null, results: rows.map((b) => ({ ...b })) }
  })

  mockedBooks.getBook.mockImplementation(async (id) => {
    const found = state.books.find((b) => b.id === id)
    if (!found) throw apiError('not_found', 'Book not found.')
    return { ...found }
  })

  mockedBooks.ensureMonthlyBook.mockImplementation(async (year, month) => {
    const existing = state.books.find((b) => b.type === 'MONTHLY' && b.year === year && b.month === month)
    if (existing) return { book: { ...existing }, created: false }
    const created = makeBook({
      type: 'MONTHLY',
      year,
      month,
      name: `Month ${month} ${year}`,
      is_archived: false,
    })
    state.books.unshift(created)
    return { book: { ...created }, created: true }
  })

  // Categories mocks
  mockedCats.listCategories.mockImplementation(async (params = {}) => {
    let rows = state.categories
    if (params.type) rows = rows.filter((c) => c.type === params.type)
    if (params.is_active !== undefined) rows = rows.filter((c) => c.is_active === params.is_active)
    return { count: rows.length, next: null, previous: null, results: rows.map((c) => ({ ...c })) }
  })

  // Payment methods mocks
  mockedPms.listPaymentMethods.mockImplementation(async (params = {}) => {
    let rows = state.paymentMethods
    if (params.is_active !== undefined) rows = rows.filter((p) => p.is_active === params.is_active)
    return { count: rows.length, next: null, previous: null, results: rows.map((p) => ({ ...p })) }
  })

  // Transactions mocks
  mockedTxns.listTransactions.mockImplementation(async (params = {}) => {
    let rows = state.transactions
    if (params.book_id) rows = rows.filter((t) => t.book_id === params.book_id)
    if (params.type) rows = rows.filter((t) => t.type === params.type)
    if (params.category_id) rows = rows.filter((t) => t.category?.id === params.category_id)
    if (params.payment_method_id) rows = rows.filter((t) => t.payment_method?.id === params.payment_method_id)
    if (params.date_from) rows = rows.filter((t) => t.transaction_date >= (params.date_from as string))
    if (params.date_to) rows = rows.filter((t) => t.transaction_date <= (params.date_to as string))
    if (params.search) {
      const term = params.search.toLowerCase()
      rows = rows.filter((t) => (t.description ?? '').toLowerCase().includes(term))
    }
    return { count: rows.length, next: null, previous: null, results: rows.map((t) => ({ ...t })) }
  })

  mockedTxns.getTransaction.mockImplementation(async (id) => {
    const found = state.transactions.find((t) => t.id === id)
    if (!found) throw apiError('not_found', 'Transaction not found.')
    return { ...found }
  })

  mockedTxns.createTransaction.mockImplementation(async (payload) => {
    const category = payload.category_id
      ? state.categories.find((c) => c.id === payload.category_id)
      : null
    const paymentMethod = payload.payment_method_id
      ? state.paymentMethods.find((p) => p.id === payload.payment_method_id)
      : null

    const txn = makeTransaction({
      book_id: payload.book_id,
      type: payload.type,
      amount: payload.amount,
      transaction_date: payload.transaction_date,
      category: category ? { id: category.id, name: category.name, type: category.type } : null,
      payment_method: paymentMethod ? { id: paymentMethod.id, name: paymentMethod.name } : null,
      description: payload.description ?? null,
    })
    state.transactions.unshift(txn)
    return { ...txn }
  })

  mockedTxns.updateTransaction.mockImplementation(async (id, payload) => {
    const txn = state.transactions.find((t) => t.id === id)
    if (!txn) throw apiError('not_found', 'Transaction not found.')

    if (payload.book_id) txn.book_id = payload.book_id
    if (payload.type) txn.type = payload.type
    if (payload.amount) txn.amount = payload.amount
    if (payload.transaction_date) txn.transaction_date = payload.transaction_date
    if (payload.description !== undefined) txn.description = payload.description
    if (payload.category_id !== undefined) {
      const cat = payload.category_id ? state.categories.find((c) => c.id === payload.category_id) : null
      txn.category = cat ? { id: cat.id, name: cat.name, type: cat.type } : null
    }
    if (payload.payment_method_id !== undefined) {
      const pm = payload.payment_method_id ? state.paymentMethods.find((p) => p.id === payload.payment_method_id) : null
      txn.payment_method = pm ? { id: pm.id, name: pm.name } : null
    }

    return { ...txn }
  })

  mockedTxns.deleteTransaction.mockImplementation(async (id) => {
    const idx = state.transactions.findIndex((t) => t.id === id)
    if (idx !== -1) {
      state.transactions.splice(idx, 1)
    }
  })

  return state
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

export function renderTransactionsApp(
  initialPath: string,
  options: { client?: QueryClient } = {},
) {
  const client = options.client ?? createTestQueryClient()
  const routes = (
    <Routes>
      <Route path="/books" element={<BooksPage />} />
      <Route path="/books/:id" element={<BookDetailsPage />} />
      <Route path="/transactions/new" element={<TransactionCreatePage />} />
      <Route path="/transactions/:id/edit" element={<TransactionEditPage />} />
      <Route path="/transactions/:id" element={<TransactionEditPage />} />
      <Route path="*" element={<div>Elsewhere</div>} />
    </Routes>
  )
  const tree = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ToastProvider>
          {routes}
          <LocationProbe />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
  const result = render(tree)
  return { client, ...result }
}
