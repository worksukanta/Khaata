/**
 * FE-006 routing and integration: protected routes, AppShell integration,
 * navigation, and cache invalidation after transaction writes.
 */

import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = {
  initializing: false,
  user: null as { id: string; email: string; display_name: string; timezone: string } | null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}

vi.mock('@/services/api/reports')
vi.mock('@/services/api/books')
vi.mock('@/services/api/budgets')
vi.mock('@/services/api/categories')
vi.mock('@/services/api/transactions')
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => authState,
}))

import AppShell from '@/components/layout/AppShell'
import NotFoundPage from '@/components/layout/NotFoundPage'
import PrivateRoute from '@/features/auth/PrivateRoute'
import BudgetDetailsPage from '@/features/budgets/BudgetDetailsPage'
import BudgetsPage from '@/features/budgets/BudgetsPage'
import { createTestQueryClient, makeBudget, makeReport } from '@/features/budgets/testUtils'
import HomePage from '@/features/home/HomePage'
import { useCreateTransaction, useDeleteTransaction, useUpdateTransaction } from '@/features/transactions/hooks/useTransactions'
import * as booksApi from '@/services/api/books'
import * as budgetsApi from '@/services/api/budgets'
import * as categoriesApi from '@/services/api/categories'
import * as reportsApi from '@/services/api/reports'
import * as transactionsApi from '@/services/api/transactions'

const reports = vi.mocked(reportsApi)
const budgets = vi.mocked(budgetsApi)
const books = vi.mocked(booksApi)
const categories = vi.mocked(categoriesApi)
const transactions = vi.mocked(transactionsApi)

const user = { id: 'u1', email: 'a@b.c', display_name: 'Alice', timezone: 'UTC' }
const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] }

function renderApp(path: string, client = createTestQueryClient()) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/" element={<PrivateRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<HomePage />} />
              <Route path="books" element={<div>Books Page</div>} />
              <Route path="transactions/new" element={<div>New Transaction</div>} />
              <Route path="budgets" element={<BudgetsPage />} />
              <Route path="budgets/:id" element={<BudgetDetailsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  authState.initializing = false
  authState.user = user
  reports.getMonthlyReport.mockResolvedValue(makeReport())
  reports.getBudgetUtilization.mockResolvedValue({ period: { year: 2026, month: 10 }, budget: null })
  books.listBooks.mockResolvedValue(EMPTY_PAGE)
  budgets.listBudgets.mockResolvedValue(EMPTY_PAGE)
  categories.listCategories.mockResolvedValue(EMPTY_PAGE)
})

describe('Dashboard and Budgets routing', () => {
  it.each(['/', '/budgets', '/budgets/b0000000-0000-4000-8000-000000000001'])(
    'redirects unauthenticated users from %s to /login without calling the API',
    (path) => {
      authState.user = null

      renderApp(path)

      expect(screen.getByText('Login Page')).toBeInTheDocument()
      expect(reports.getMonthlyReport).not.toHaveBeenCalled()
      expect(reports.getBudgetUtilization).not.toHaveBeenCalled()
      expect(budgets.listBudgets).not.toHaveBeenCalled()
      expect(budgets.getBudget).not.toHaveBeenCalled()
    },
  )

  it('renders the dashboard inside the single AppShell with Home current', async () => {
    renderApp('/?year=2026&month=10')

    expect(await screen.findByRole('heading', { level: 1, name: 'Home' })).toBeInTheDocument()
    expect(screen.getAllByRole('banner')).toHaveLength(1)
    expect(screen.getAllByRole('complementary')).toHaveLength(1)
    const sidebar = screen.getByRole('complementary')
    expect(within(sidebar).getByRole('link', { name: /home/i })).toHaveAttribute('aria-current', 'page')
    await screen.findByTestId('dashboard-content')
  })

  it('renders /budgets directly inside the shell with Budgets current', async () => {
    renderApp('/budgets?year=2026&month=10')

    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
    const sidebar = screen.getByRole('complementary')
    expect(within(sidebar).getByRole('link', { name: /budgets/i })).toHaveAttribute('aria-current', 'page')
    await screen.findByText('No budget set for this month')
  })

  it('navigates from the dashboard budget card to Budgets for the same month', async () => {
    reports.getMonthlyReport.mockResolvedValue(
      makeReport({
        budget: {
          total_limit: null,
          spent: null,
          remaining: null,
          utilization_percent: null,
          status: 'NOT_SET',
        },
      }),
    )
    const userEv = userEvent.setup()

    renderApp('/?year=2026&month=10')
    await userEv.click(await screen.findByRole('link', { name: 'Set a budget' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
    expect(reports.getBudgetUtilization).toHaveBeenCalledWith(2026, 10, expect.anything())
  })

  it('navigates from the dashboard to add a transaction and to books', async () => {
    const userEv = userEvent.setup()

    renderApp('/?year=2026&month=10')
    await userEv.click(await screen.findByRole('link', { name: 'Add transaction' }))
    expect(await screen.findByText('New Transaction')).toBeInTheDocument()
  })

  it('opens the category allocations page from the monthly budget', async () => {
    const budget = makeBudget({ id: 'b0000000-0000-4000-8000-0000000000aa' })
    reports.getBudgetUtilization.mockResolvedValue({ period: { year: 2026, month: 10 }, budget })
    budgets.getBudget.mockResolvedValue(budget)
    const userEv = userEvent.setup()

    renderApp('/budgets?year=2026&month=10')
    await userEv.click(await screen.findByRole('link', { name: 'Category allocations' }))

    expect(await screen.findByTestId('total-limit')).toHaveTextContent('₹10,000.00')
    await userEv.click(screen.getByRole('link', { name: /back to budgets/i }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Budgets' })).toBeInTheDocument()
  })
})

describe('Cache invalidation after transaction writes', () => {
  const payload = {
    book_id: 'b',
    type: 'EXPENSE' as const,
    amount: '10.00',
    transaction_date: '2026-10-01',
  }

  function Harness() {
    const create = useCreateTransaction()
    const update = useUpdateTransaction()
    const remove = useDeleteTransaction()
    return (
      <>
        <button onClick={() => create.mutate(payload)}>create</button>
        <button onClick={() => update.mutate({ id: 't1', payload: { amount: '11.00' } })}>update</button>
        <button onClick={() => remove.mutate('t1')}>delete</button>
      </>
    )
  }

  it.each(['create', 'update', 'delete'])(
    'a successful %s invalidates budgets and reports',
    async (action) => {
      const txn = { id: 't1', ...payload } as never
      transactions.createTransaction.mockResolvedValue(txn)
      transactions.updateTransaction.mockResolvedValue(txn)
      transactions.deleteTransaction.mockResolvedValue(undefined)
      const client = createTestQueryClient()
      const invalidate = vi.spyOn(client, 'invalidateQueries')
      const userEv = userEvent.setup()

      render(
        <QueryClientProvider client={client}>
          <Harness />
        </QueryClientProvider>,
      )
      await userEv.click(screen.getByRole('button', { name: action }))

      await waitFor(() => {
        const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey)
        expect(keys).toContainEqual(['budgets'])
        expect(keys).toContainEqual(['reports'])
      })
    },
  )

  it('does not invalidate budgets or reports when the write fails', async () => {
    transactions.createTransaction.mockRejectedValue({ error: { code: 'validation_error', message: 'x' } })
    const client = createTestQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const userEv = userEvent.setup()

    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    )
    await userEv.click(screen.getByRole('button', { name: 'create' }))

    await waitFor(() => expect(transactions.createTransaction).toHaveBeenCalled())
    expect(invalidate).not.toHaveBeenCalled()
  })
})
