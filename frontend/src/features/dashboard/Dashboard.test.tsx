import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/reports')
vi.mock('@/services/api/books')
vi.mock('@/services/api/budgets')
vi.mock('@/services/api/categories')

import * as booksApi from '@/services/api/books'
import * as reportsApi from '@/services/api/reports'
import { apiError, makeReport, makeReportTransaction, renderBudgetsApp } from '@/features/budgets/testUtils'
import { makeBook } from '@/features/books/testUtils'

const reports = vi.mocked(reportsApi)
const books = vi.mocked(booksApi)

const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] }

beforeEach(() => {
  vi.clearAllMocks()
  books.listBooks.mockResolvedValue(EMPTY_PAGE)
})

describe('Dashboard (Home)', () => {
  it('requests the report for the selected month from the URL', async () => {
    reports.getMonthlyReport.mockResolvedValue(makeReport())

    renderBudgetsApp('/?year=2026&month=10')

    await screen.findByTestId('dashboard-content')
    expect(reports.getMonthlyReport).toHaveBeenCalledWith(2026, 10, expect.anything())
    expect(screen.getByTestId('selected-month')).toHaveTextContent('October 2026')
  })

  it('renders the server-provided KPI strings without recalculation', async () => {
    reports.getMonthlyReport.mockResolvedValue(
      makeReport({
        income_total: '1234567.89',
        expense_total: '0.10',
        net_cash_flow: '1234567.79',
      }),
    )

    renderBudgetsApp('/?year=2026&month=10')

    expect(await screen.findByTestId('kpi-income')).toHaveTextContent('₹12,34,567.89')
    expect(screen.getByTestId('kpi-expenses')).toHaveTextContent('₹0.10')
    expect(screen.getByTestId('kpi-net')).toHaveTextContent('₹12,34,567.79')
    expect(screen.getByText('Income minus expenses')).toBeInTheDocument()
  })

  it('flags negative net cash flow', async () => {
    reports.getMonthlyReport.mockResolvedValue(
      makeReport({ income_total: '100.00', expense_total: '350.00', net_cash_flow: '-250.00' }),
    )

    renderBudgetsApp('/?year=2026&month=10')

    expect(await screen.findByTestId('kpi-net')).toHaveTextContent('-₹250.00')
    expect(screen.getByText(/Negative — expenses exceeded income/)).toBeInTheDocument()
  })

  it('shows a loading skeleton and no zero KPIs while loading', () => {
    reports.getMonthlyReport.mockReturnValue(new Promise(() => undefined))

    renderBudgetsApp('/?year=2026&month=10')

    expect(screen.getByLabelText(/Loading October 2026/)).toBeInTheDocument()
    expect(screen.queryByTestId('kpi-income')).not.toBeInTheDocument()
  })

  it('shows an error with retry that refetches', async () => {
    reports.getMonthlyReport
      .mockRejectedValueOnce(apiError('forbidden', 'Boom'))
      .mockResolvedValueOnce(makeReport())
    const user = userEvent.setup()

    renderBudgetsApp('/?year=2026&month=10')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Boom')
    await user.click(within(alert).getByRole('button', { name: /retry|try again/i }))

    expect(await screen.findByTestId('kpi-income')).toBeInTheDocument()
    expect(reports.getMonthlyReport).toHaveBeenCalledTimes(2)
  })

  it('shows an empty state for a month with no entries but keeps the zero totals', async () => {
    reports.getMonthlyReport.mockResolvedValue(
      makeReport({
        income_total: '0.00',
        expense_total: '0.00',
        net_cash_flow: '0.00',
        category_breakdown: [],
        recent_transactions: [],
        budget: {
          total_limit: null,
          spent: null,
          remaining: null,
          utilization_percent: null,
          status: 'NOT_SET',
        },
      }),
    )

    renderBudgetsApp('/?year=2026&month=10')

    expect(await screen.findByText('No entries for this month')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add your first entry' })).toHaveAttribute(
      'href',
      '/transactions/new',
    )
    expect(screen.getByText('No expenses recorded for this month.')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-income')).toHaveTextContent('₹0.00')
  })

  it('renders every book-type row with its income and expenses', async () => {
    reports.getMonthlyReport.mockResolvedValue(makeReport())

    renderBudgetsApp('/?year=2026&month=10')

    const monthly = await screen.findByTestId('book-type-MONTHLY')
    expect(monthly).toHaveTextContent('Monthly books')
    expect(monthly).toHaveTextContent('₹50,000.00')
    expect(monthly).toHaveTextContent('₹10,000.00')
    expect(screen.getByTestId('book-type-EVENT')).toHaveTextContent('₹2,000.00')
    expect(screen.getByTestId('book-type-GENERAL')).toHaveTextContent('₹345.67')
  })

  it('renders category rows in server order including an Uncategorised bucket', async () => {
    reports.getMonthlyReport.mockResolvedValue(makeReport())

    renderBudgetsApp('/?year=2026&month=10')

    await screen.findByTestId('dashboard-content')
    const rows = screen.getAllByTestId('category-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Food')
    expect(rows[0]).toHaveTextContent('₹8,000.00')
    expect(rows[1]).toHaveTextContent('Uncategorised')
    expect(rows[1]).toHaveTextContent('₹4,345.67')
  })

  it('shows the server budget status and figures', async () => {
    reports.getMonthlyReport.mockResolvedValue(
      makeReport({
        budget: {
          total_limit: '1000.00',
          spent: '1250.00',
          remaining: '-250.00',
          utilization_percent: '125.00',
          status: 'OVER_BUDGET',
        },
      }),
    )

    renderBudgetsApp('/?year=2026&month=10')

    const progress = await screen.findByTestId('budget-progress')
    expect(progress).toHaveAttribute('data-status', 'OVER_BUDGET')
    expect(within(progress).getByTestId('budget-summary')).toHaveTextContent(
      '₹250.00 over budget · 125.00%',
    )
    expect(screen.getByRole('link', { name: 'View budget details' })).toHaveAttribute(
      'href',
      '/budgets?year=2026&month=10',
    )
  })

  it('shows a Set a budget call to action when the status is NOT_SET', async () => {
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

    renderBudgetsApp('/?year=2026&month=10')

    expect(await screen.findByRole('link', { name: 'Set a budget' })).toHaveAttribute(
      'href',
      '/budgets?year=2026&month=10',
    )
    expect(screen.queryByTestId('budget-progress')).not.toBeInTheDocument()
  })

  it('labels recent transactions with book names and falls back to a generic link', async () => {
    const known = makeBook({ id: '00000000-0000-4000-8000-0000000000aa', name: 'Goa Trip' })
    books.listBooks.mockResolvedValue({ ...EMPTY_PAGE, count: 1, results: [known] })
    reports.getMonthlyReport.mockResolvedValue(
      makeReport({
        recent_transactions: [
          makeReportTransaction({ description: 'Hotel', book_id: known.id, amount: '4000.00' }),
          makeReportTransaction({
            description: 'Salary',
            type: 'INCOME',
            amount: '50000.00',
            book_id: '00000000-0000-4000-8000-0000000000bb',
            category: null,
          }),
        ],
      }),
    )

    renderBudgetsApp('/?year=2026&month=10')

    const rows = await screen.findAllByTestId('recent-transaction')
    await waitFor(() => expect(rows[0]).toHaveTextContent('Goa Trip'))
    expect(rows[0]).toHaveTextContent('Hotel')
    expect(rows[1]).toHaveTextContent('Open book')
    expect(rows[1]).toHaveTextContent('₹50,000.00')
  })

  it('labels recent transactions from books on subsequent pages', async () => {
    const bookPage1 = makeBook({ id: '00000000-0000-4000-8000-000000000001', name: 'October 2026' })
    const bookPage2 = makeBook({ id: '00000000-0000-4000-8000-000000000002', name: 'Older Event' })
    books.listBooks
      .mockResolvedValueOnce({
        count: 2,
        next: 'http://test/?page=2',
        previous: null,
        results: [bookPage1],
      })
      .mockResolvedValueOnce({
        count: 2,
        next: null,
        previous: 'http://test/?page=1',
        results: [bookPage2],
      })
    reports.getMonthlyReport.mockResolvedValue(
      makeReport({
        recent_transactions: [
          makeReportTransaction({ description: 'Decorations', book_id: bookPage2.id, amount: '1200.00' }),
        ],
      }),
    )

    renderBudgetsApp('/?year=2026&month=10')

    const rows = await screen.findAllByTestId('recent-transaction')
    await waitFor(() => expect(rows[0]).toHaveTextContent('Older Event'))
    expect(rows[0]).toHaveTextContent('Decorations')
  })

  it('navigates months through the URL, rolling the year over from December to January', async () => {
    reports.getMonthlyReport.mockResolvedValue(makeReport())
    const user = userEvent.setup()

    renderBudgetsApp('/?year=2026&month=12')
    await screen.findByTestId('dashboard-content')

    await user.click(screen.getByRole('button', { name: 'Next month' }))

    await waitFor(() =>
      expect(reports.getMonthlyReport).toHaveBeenCalledWith(2027, 1, expect.anything()),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/?year=2027&month=1')
    expect(screen.getByTestId('selected-month')).toHaveTextContent('January 2027')

    await user.click(screen.getByRole('button', { name: 'Previous month' }))
    await waitFor(() =>
      expect(reports.getMonthlyReport).toHaveBeenLastCalledWith(2026, 12, expect.anything()),
    )
  })

  it('defaults to the current month when no valid params are given', async () => {
    reports.getMonthlyReport.mockResolvedValue(makeReport())

    renderBudgetsApp('/?year=abc&month=99')

    await screen.findByTestId('dashboard-content')
    const [year, month] = reports.getMonthlyReport.mock.calls[0]
    expect(year).toBeGreaterThanOrEqual(2025)
    expect(month).toBeGreaterThanOrEqual(1)
    expect(month).toBeLessThanOrEqual(12)
  })

  it('links to add a transaction', async () => {
    reports.getMonthlyReport.mockResolvedValue(makeReport())

    renderBudgetsApp('/?year=2026&month=10')

    expect(await screen.findByRole('link', { name: 'Add transaction' })).toHaveAttribute(
      'href',
      '/transactions/new',
    )
  })
})
