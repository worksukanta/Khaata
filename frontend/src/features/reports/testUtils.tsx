/* eslint-disable react-refresh/only-export-components -- test helper module, not a component boundary */
/**
 * Shared test helpers for the Reports feature.
 *
 * Test files must `vi.mock` the service modules (reports, books, categories,
 * paymentMethods, transactions, exports) and `./download` before importing this module.
 */

import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Toast'
import ReportsPage from './ReportsPage'
import type { BookReport } from '@/types'

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

export function makeBookReport(overrides: Partial<BookReport> = {}): BookReport {
  return {
    book: {
      id: '00000000-0000-4000-8000-0000000000b1',
      type: 'EVENT',
      name: 'Goa Trip',
      is_archived: false,
    },
    income_total: '1000.00',
    expense_total: '2500.50',
    net_cash_flow: '-1500.50',
    closing_balance: '-1400.50',
    category_breakdown: [
      { category_id: 'cat-food', category_name: 'Food', total: '1500.50' },
      { category_id: null, category_name: 'Uncategorised', total: '1000.00' },
    ],
    budget: null,
    ...overrides,
  }
}

export function page<T>(results: T[], extra: { next?: string | null; previous?: string | null } = {}) {
  return { count: results.length, next: extra.next ?? null, previous: extra.previous ?? null, results }
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname + location.search}</div>
}

export function renderReportsApp(initialPath: string) {
  const client = createTestQueryClient()
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ToastProvider>
          <Routes>
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="*" element={<div>Elsewhere</div>} />
          </Routes>
          <LocationProbe />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, ...result }
}
