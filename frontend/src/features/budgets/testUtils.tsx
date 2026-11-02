/* eslint-disable react-refresh/only-export-components -- test helper module, not a component boundary */
/**
 * Shared test helpers for the Budgets and Dashboard features.
 *
 * Test files must `vi.mock` the service modules they exercise (reports, budgets,
 * books, categories, transactions) before importing this module.
 */

import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { vi } from 'vitest'
import { ToastProvider } from '@/components/ui/Toast'
import HomePage from '@/features/home/HomePage'
import type {
  ApiError,
  Budget,
  BudgetAllocation,
  MonthlyReport,
  Transaction,
} from '@/types'
import BudgetDetailsPage from './BudgetDetailsPage'
import BudgetsPage from './BudgetsPage'

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

let counter = 0

function uuid(prefix: string): string {
  counter += 1
  return `${prefix}0000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
}

export function makeAllocation(overrides: Partial<BudgetAllocation> = {}): BudgetAllocation {
  return {
    category: { id: uuid('c'), name: 'Food', type: 'EXPENSE', is_active: true },
    amount: '2000.00',
    spent: '500.00',
    remaining: '1500.00',
    utilization_percent: '25.00',
    status: 'ON_TRACK',
    ...overrides,
  }
}

export function makeBudget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: uuid('b'),
    scope: 'MONTHLY_OVERALL',
    book_id: null,
    year: 2026,
    month: 10,
    total_limit: '10000.00',
    allocations: [],
    allocated_total: '0.00',
    unallocated: '10000.00',
    spent: '2500.00',
    remaining: '7500.00',
    utilization_percent: '25.00',
    status: 'ON_TRACK',
    unallocated_spent: '2500.00',
    uncategorised_spent: '0.00',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    ...overrides,
  }
}

export function makeReportTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: uuid('d'),
    book_id: '00000000-0000-4000-8000-0000000000aa',
    type: 'EXPENSE',
    amount: '150.00',
    transaction_date: '2026-10-27',
    category: { id: 'cat-food', name: 'Food', type: 'EXPENSE' },
    payment_method: null,
    description: 'Lunch',
    created_at: '2026-10-27T10:00:00Z',
    updated_at: '2026-10-27T10:00:00Z',
    ...overrides,
  }
}

export function makeReport(overrides: Partial<MonthlyReport> = {}): MonthlyReport {
  return {
    period: { year: 2026, month: 10 },
    currency: 'INR',
    income_total: '50000.00',
    expense_total: '12345.67',
    net_cash_flow: '37654.33',
    book_type_breakdown: [
      { book_type: 'MONTHLY', income: '50000.00', expenses: '10000.00' },
      { book_type: 'EVENT', income: '0.00', expenses: '2000.00' },
      { book_type: 'GENERAL', income: '0.00', expenses: '345.67' },
    ],
    category_breakdown: [
      { category_id: 'cat-food', category_name: 'Food', total: '8000.00' },
      { category_id: null, category_name: 'Uncategorised', total: '4345.67' },
    ],
    budget: {
      total_limit: '20000.00',
      spent: '12345.67',
      remaining: '7654.33',
      utilization_percent: '61.73',
      status: 'ON_TRACK',
    },
    recent_transactions: [makeReportTransaction()],
    ...overrides,
  }
}

export function apiError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiError {
  return { error: { code, message, ...(details ? { details } : {}) } } as ApiError
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

export function renderBudgetsApp(initialPath: string, options: { client?: QueryClient } = {}) {
  const client = options.client ?? createTestQueryClient()
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
            <Route path="/budgets/:id" element={<BudgetDetailsPage />} />
            <Route path="*" element={<div>Elsewhere</div>} />
          </Routes>
          <LocationProbe />
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { client, ...result }
}
