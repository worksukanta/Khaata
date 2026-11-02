/* eslint-disable react-refresh/only-export-components -- test helper module, not a fast-refresh boundary */
/**
 * Shared test helpers for the Books feature.
 *
 * Test files must call `vi.mock('@/services/api/books')` (automock) before
 * importing this module so that the service functions are `vi.fn()`s which
 * `installFakeBackend` then wires to a small in-memory fake of the Books API.
 */

import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import * as booksApi from '@/services/api/books'
import { ToastProvider } from '@/components/ui/Toast'
import BooksPage from './BooksPage'
import BookDetailsPage from './BookDetailsPage'
import type { ApiError, Book } from '@/types'

let counter = 0

export function makeBook(overrides: Partial<Book> = {}): Book {
  counter += 1
  const n = String(counter).padStart(12, '0')
  return {
    id: `00000000-0000-4000-8000-${n}`,
    type: 'EVENT',
    name: `Book ${counter}`,
    description: '',
    year: null,
    month: null,
    start_date: null,
    end_date: null,
    opening_balance: '0.00',
    is_archived: false,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

export function makeMonthlyBook(year: number, month: number, overrides: Partial<Book> = {}): Book {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return makeBook({
    type: 'MONTHLY',
    name: `${names[month - 1]} ${year}`,
    year,
    month,
    ...overrides,
  })
}

export function apiError(code: string, message: string, details?: Record<string, string[]>): ApiError {
  return { error: { code, message, ...(details ? { details } : {}) } }
}

export interface FakeBackend {
  books: Book[]
}

/** Wire the automocked service module to an in-memory backend. */
export function installFakeBackend(initial: Book[] = []): FakeBackend {
  const state: FakeBackend = { books: initial.map((b) => ({ ...b })) }
  const mocked = vi.mocked(booksApi)

  mocked.listBooks.mockImplementation(async (params = {}) => {
    let rows = state.books.filter((b) => !params.type || b.type === params.type)
    if (params.is_archived !== undefined) {
      rows = rows.filter((b) => b.is_archived === params.is_archived)
    }
    const term = params.search?.trim().toLowerCase()
    if (term) {
      rows = rows.filter(
        (b) =>
          b.name.toLowerCase().includes(term) ||
          (b.description ?? '').toLowerCase().includes(term),
      )
    }
    return {
      count: rows.length,
      next: null,
      previous: null,
      results: rows.map((b) => ({ ...b })),
    }
  })

  mocked.getBook.mockImplementation(async (id) => {
    const found = state.books.find((b) => b.id === id)
    if (!found) throw apiError('not_found', 'Not found.')
    return { ...found }
  })

  mocked.createBook.mockImplementation(async (payload) => {
    const book = makeBook({
      type: payload.type,
      name: payload.name,
      description: payload.description ?? '',
      start_date: payload.start_date ?? null,
      end_date: payload.end_date ?? null,
    })
    state.books.unshift(book)
    return { ...book }
  })

  mocked.updateBook.mockImplementation(async (id, payload) => {
    const book = state.books.find((b) => b.id === id)
    if (!book) throw apiError('not_found', 'Not found.')
    Object.assign(book, payload)
    return { ...book }
  })

  mocked.archiveBook.mockImplementation(async (id) => {
    const book = state.books.find((b) => b.id === id)
    if (!book) throw apiError('not_found', 'Not found.')
    book.is_archived = true
    return { ...book }
  })

  mocked.restoreBook.mockImplementation(async (id) => {
    const book = state.books.find((b) => b.id === id)
    if (!book) throw apiError('not_found', 'Not found.')
    book.is_archived = false
    return { ...book }
  })

  mocked.ensureMonthlyBook.mockImplementation(async (year, month) => {
    const existing = state.books.find(
      (b) => b.type === 'MONTHLY' && b.year === year && b.month === month,
    )
    if (existing) return { book: { ...existing }, created: false }
    const book = makeMonthlyBook(year, month)
    state.books.unshift(book)
    return { book: { ...book }, created: true }
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

/** Render the Books routes with query, router and toast providers. */
export function renderBooksApp(initialPath: string, options: { client?: QueryClient } = {}) {
  const client = options.client ?? createTestQueryClient()
  const routes = (
    <Routes>
      <Route path="/books" element={<BooksPage />} />
      <Route path="/books/:id" element={<BookDetailsPage />} />
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
