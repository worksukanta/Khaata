import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/reports')
vi.mock('@/services/api/books')
vi.mock('@/services/api/budgets')
vi.mock('@/services/api/categories')

import { makeBook } from '@/features/books/testUtils'
import {
  apiError,
  createTestQueryClient,
  makeBudget,
  renderBudgetsApp,
} from '@/features/budgets/testUtils'
import * as booksApi from '@/services/api/books'
import * as budgetsApi from '@/services/api/budgets'
import * as reportsApi from '@/services/api/reports'

const reports = vi.mocked(reportsApi)
const budgets = vi.mocked(budgetsApi)
const books = vi.mocked(booksApi)

const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] }
const PATH = '/budgets?year=2026&month=10'

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results }
}

beforeEach(() => {
  vi.resetAllMocks()
  reports.getBudgetUtilization.mockResolvedValue({ period: { year: 2026, month: 10 }, budget: null })
  budgets.listBudgets.mockResolvedValue(EMPTY_PAGE)
  books.listBooks.mockResolvedValue(EMPTY_PAGE)
})

describe('BudgetsPage — monthly budget', () => {
  it('requests utilization for the selected month', async () => {
    renderBudgetsApp(PATH)

    await screen.findByText('No budget set for this month')
    expect(reports.getBudgetUtilization).toHaveBeenCalledWith(2026, 10, expect.anything())
    expect(screen.getByRole('heading', { name: /Overall monthly budget — October 2026/ })).toBeInTheDocument()
  })

  it('shows a loading skeleton while the budget loads', () => {
    reports.getBudgetUtilization.mockReturnValue(new Promise(() => undefined))

    renderBudgetsApp(PATH)

    expect(screen.getByLabelText('Loading monthly budget')).toBeInTheDocument()
  })

  it('shows an error with retry', async () => {
    reports.getBudgetUtilization
      .mockRejectedValueOnce(apiError('forbidden', 'No access'))
      .mockResolvedValueOnce({ period: { year: 2026, month: 10 }, budget: null })
    const user = userEvent.setup()

    renderBudgetsApp(PATH)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No access')
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('No budget set for this month')).toBeInTheDocument()
  })

  it('renders server figures for an existing on-track budget', async () => {
    reports.getBudgetUtilization.mockResolvedValue({
      period: { year: 2026, month: 10 },
      budget: makeBudget({
        total_limit: '10000.00',
        spent: '2500.00',
        remaining: '7500.00',
        utilization_percent: '25.00',
      }),
    })

    renderBudgetsApp(PATH)

    const progress = await screen.findAllByTestId('budget-progress')
    expect(progress[0]).toHaveAttribute('data-status', 'ON_TRACK')
    expect(progress[0]).toHaveTextContent('₹2,500.00 spent of ₹10,000.00')
    expect(within(progress[0]).getByTestId('budget-summary')).toHaveTextContent(
      '₹7,500.00 remaining · 25.00%',
    )
    expect(screen.getByRole('link', { name: 'Category allocations' })).toBeInTheDocument()
  })

  it('shows a near-limit budget using the server status', async () => {
    reports.getBudgetUtilization.mockResolvedValue({
      period: { year: 2026, month: 10 },
      budget: makeBudget({
        total_limit: '1000.00',
        spent: '800.00',
        remaining: '200.00',
        utilization_percent: '80.00',
        status: 'NEAR_LIMIT',
      }),
    })

    renderBudgetsApp(PATH)

    const [progress] = await screen.findAllByTestId('budget-progress')
    expect(progress).toHaveAttribute('data-status', 'NEAR_LIMIT')
    expect(within(progress).getByText(/Near limit/)).toBeInTheDocument()
  })

  it('shows overspending as an amount over budget, never a positive remaining', async () => {
    reports.getBudgetUtilization.mockResolvedValue({
      period: { year: 2026, month: 10 },
      budget: makeBudget({
        total_limit: '1000.00',
        spent: '1300.50',
        remaining: '-300.50',
        utilization_percent: '130.05',
        status: 'OVER_BUDGET',
      }),
    })

    renderBudgetsApp(PATH)

    const [progress] = await screen.findAllByTestId('budget-progress')
    expect(progress).toHaveAttribute('data-status', 'OVER_BUDGET')
    expect(within(progress).getByTestId('budget-summary')).toHaveTextContent(
      '₹300.50 over budget · 130.05%',
    )
    expect(progress).not.toHaveTextContent('remaining')
    // Visual bar is capped at 100 while the label carries the real percentage.
    expect(within(progress).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100')
  })

  it('shows zero limit with spending as unbudgeted spending without a percentage', async () => {
    reports.getBudgetUtilization.mockResolvedValue({
      period: { year: 2026, month: 10 },
      budget: makeBudget({
        total_limit: '0.00',
        spent: '75.00',
        remaining: '-75.00',
        utilization_percent: null,
        status: 'UNBUDGETED_SPENDING',
      }),
    })

    renderBudgetsApp(PATH)

    const [progress] = await screen.findAllByTestId('budget-progress')
    expect(progress).toHaveAttribute('data-status', 'UNBUDGETED_SPENDING')
    expect(within(progress).getByTestId('budget-summary')).toHaveTextContent(
      'Unbudgeted spending — no limit set for ₹75.00 spent',
    )
    expect(progress).not.toHaveTextContent('NaN')
    expect(progress).not.toHaveTextContent('Infinity')
  })

  it('shows zero limit with zero spending as on track', async () => {
    reports.getBudgetUtilization.mockResolvedValue({
      period: { year: 2026, month: 10 },
      budget: makeBudget({
        total_limit: '0.00',
        spent: '0.00',
        remaining: '0.00',
        utilization_percent: '0.00',
        status: 'ON_TRACK',
      }),
    })

    renderBudgetsApp(PATH)

    const [progress] = await screen.findAllByTestId('budget-progress')
    expect(progress).toHaveAttribute('data-status', 'ON_TRACK')
    expect(within(progress).getByTestId('budget-summary')).toHaveTextContent(
      '₹0.00 remaining · 0.00%',
    )
  })

  it('creates the monthly budget, toasts, and invalidates budgets and reports', async () => {
    const created = makeBudget({ total_limit: '15000.00' })
    budgets.createBudget.mockResolvedValue(created)
    const client = createTestQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const user = userEvent.setup()

    renderBudgetsApp(PATH, { client })
    await user.click(await screen.findByRole('button', { name: 'Set budget' }))

    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Total limit/), '15000')
    await user.click(within(dialog).getByRole('button', { name: 'Set budget' }))

    await waitFor(() =>
      expect(budgets.createBudget).toHaveBeenCalledWith({
        scope: 'MONTHLY_OVERALL',
        year: 2026,
        month: 10,
        total_limit: '15000.00',
      }),
    )
    expect(await screen.findByText('Budget created.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toContainEqual(['budgets', 'list'])
    expect(keys).toContainEqual(['reports'])
    expect(client.getQueryData(['budgets', 'detail', created.id])).toEqual(created)
  })

  it('refetches the monthly budget after creating it', async () => {
    const created = makeBudget({ total_limit: '500.00', spent: '0.00', remaining: '500.00', utilization_percent: '0.00' })
    budgets.createBudget.mockImplementation(async () => {
      reports.getBudgetUtilization.mockResolvedValue({ period: { year: 2026, month: 10 }, budget: created })
      return created
    })
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await user.click(await screen.findByRole('button', { name: 'Set budget' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Total limit/), '500')
    await user.click(within(dialog).getByRole('button', { name: 'Set budget' }))

    expect(await screen.findByRole('link', { name: 'Category allocations' })).toBeInTheDocument()
  })

  it('validates the limit: required, non-negative, at most two decimals — zero is allowed', async () => {
    budgets.createBudget.mockResolvedValue(makeBudget({ total_limit: '0.00' }))
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await user.click(await screen.findByRole('button', { name: 'Set budget' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText(/Total limit/)
    const submit = within(dialog).getByRole('button', { name: 'Set budget' })

    await user.click(submit)
    expect(await within(dialog).findByText('Budget limit is required.')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '-5')
    await user.click(submit)
    expect(await within(dialog).findByText('Budget limit cannot be negative.')).toBeInTheDocument()

    await user.clear(input)
    await user.type(input, '1.234')
    await user.click(submit)
    expect(await within(dialog).findByText(/at most 2 decimal places/)).toBeInTheDocument()
    expect(budgets.createBudget).not.toHaveBeenCalled()

    await user.clear(input)
    await user.type(input, '0')
    await user.click(submit)
    await waitFor(() =>
      expect(budgets.createBudget).toHaveBeenCalledWith(
        expect.objectContaining({ total_limit: '0.00' }),
      ),
    )
  })

  it('keeps the dialog and the typed value when the server rejects the budget', async () => {
    budgets.createBudget.mockRejectedValue(
      apiError('validation_error', 'Invalid', { total_limit: ['Too large for this period.'] }),
    )
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await user.click(await screen.findByRole('button', { name: 'Set budget' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText(/Total limit/)
    await user.type(input, '999')
    await user.click(within(dialog).getByRole('button', { name: 'Set budget' }))

    expect(await within(dialog).findByText('Too large for this period.')).toBeInTheDocument()
    expect(input).toHaveValue('999')
    expect(screen.queryByText('Budget created.')).not.toBeInTheDocument()
  })

  it('edits the monthly limit with PATCH and toasts', async () => {
    const existing = makeBudget({ total_limit: '10000.00' })
    reports.getBudgetUtilization.mockResolvedValue({ period: { year: 2026, month: 10 }, budget: existing })
    budgets.updateBudget.mockResolvedValue({ ...existing, total_limit: '12000.00' })
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await user.click(await screen.findByRole('button', { name: 'Edit overall budget' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText(/Total limit/)
    expect(input).toHaveValue('10000.00')
    await user.clear(input)
    await user.type(input, '12000')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(budgets.updateBudget).toHaveBeenCalledWith(existing.id, { total_limit: '12000.00' }),
    )
    expect(await screen.findByText('Budget updated.')).toBeInTheDocument()
  })

  it('shows the server error when the limit is lowered below the allocated total', async () => {
    const existing = makeBudget()
    reports.getBudgetUtilization.mockResolvedValue({ period: { year: 2026, month: 10 }, budget: existing })
    budgets.updateBudget.mockRejectedValue(
      apiError('validation_error', 'Invalid', {
        total_limit: ['Cannot be lower than the allocated total.'],
      }),
    )
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await user.click(await screen.findByRole('button', { name: 'Edit overall budget' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText(/Total limit/)
    await user.clear(input)
    await user.type(input, '1')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(
      await within(dialog).findByText('Cannot be lower than the allocated total.'),
    ).toBeInTheDocument()
    expect(input).toHaveValue('1')
  })

  it('navigates months through the URL', async () => {
    const user = userEvent.setup()

    renderBudgetsApp('/budgets?year=2026&month=1')
    await screen.findByText('No budget set for this month')

    await user.click(screen.getByRole('button', { name: 'Previous month' }))

    await waitFor(() =>
      expect(reports.getBudgetUtilization).toHaveBeenCalledWith(2025, 12, expect.anything()),
    )
    expect(screen.getByTestId('location')).toHaveTextContent('/budgets?year=2025&month=12')
  })
})

describe('BudgetsPage — event budgets', () => {
  const trip = makeBook({ id: '00000000-0000-4000-8000-0000000000e1', name: 'Goa Trip', type: 'EVENT' })
  const wedding = makeBook({ id: '00000000-0000-4000-8000-0000000000e2', name: 'Wedding', type: 'EVENT' })

  it('lists event budgets with the event scope filter and book names', async () => {
    books.listBooks.mockResolvedValue(page([trip, wedding]))
    budgets.listBudgets.mockResolvedValue(
      page([
        makeBudget({
          scope: 'EVENT',
          book_id: trip.id,
          year: null,
          month: null,
          total_limit: '5000.00',
          spent: '6000.00',
          remaining: '-1000.00',
          utilization_percent: '120.00',
          status: 'OVER_BUDGET',
        }),
      ]),
    )

    renderBudgetsApp(PATH)

    const items = await screen.findAllByTestId('event-budget')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent('Goa Trip')
    expect(items[0]).toHaveTextContent('₹1,000.00 over budget · 120.00%')
    expect(budgets.listBudgets).toHaveBeenCalledWith({ scope: 'EVENT', page: 1 }, expect.anything())
    expect(books.listBooks).toHaveBeenCalledWith(expect.objectContaining({ type: 'EVENT' }), expect.anything())
  })

  it('shows an empty state when there are no event budgets', async () => {
    renderBudgetsApp(PATH)

    expect(await screen.findByText('No event budgets yet')).toBeInTheDocument()
  })

  it('shows an error with retry when event budgets fail to load', async () => {
    budgets.listBudgets
      .mockRejectedValueOnce(apiError('forbidden', 'Denied'))
      .mockResolvedValueOnce(EMPTY_PAGE)
    const user = userEvent.setup()

    renderBudgetsApp(PATH)

    const alert = await screen.findByText('Denied')
    await user.click(within(alert.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByText('No event budgets yet')).toBeInTheDocument()
  })

  it('creates an event budget for a book that has none, excluding books already budgeted', async () => {
    books.listBooks.mockResolvedValue(page([trip, wedding]))
    budgets.listBudgets.mockResolvedValue(
      page([makeBudget({ scope: 'EVENT', book_id: trip.id, year: null, month: null })]),
    )
    budgets.createBudget.mockResolvedValue(
      makeBudget({ scope: 'EVENT', book_id: wedding.id, year: null, month: null }),
    )
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await screen.findAllByTestId('event-budget')
    await user.click(screen.getByRole('button', { name: 'Add event budget' }))

    const dialog = await screen.findByRole('dialog')
    const select = within(dialog).getByLabelText(/Event book/)
    expect(within(select).queryByRole('option', { name: 'Goa Trip' })).not.toBeInTheDocument()
    await user.selectOptions(select, wedding.id)
    await user.type(within(dialog).getByLabelText(/Total limit/), '250000')
    await user.click(within(dialog).getByRole('button', { name: 'Add event budget' }))

    await waitFor(() =>
      expect(budgets.createBudget).toHaveBeenCalledWith({
        scope: 'EVENT',
        book_id: wedding.id,
        total_limit: '250000.00',
      }),
    )
    expect(await screen.findByText('Event budget created.')).toBeInTheDocument()
  })

  it('requires an event book', async () => {
    books.listBooks.mockResolvedValue(page([trip]))
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await screen.findByText('No event budgets yet')
    await user.click(screen.getByRole('button', { name: 'Add event budget' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/Total limit/), '100')
    await user.click(within(dialog).getByRole('button', { name: 'Add event budget' }))

    expect(await within(dialog).findByText('Select an event book.')).toBeInTheDocument()
    expect(budgets.createBudget).not.toHaveBeenCalled()
  })

  it('links each event budget to its details page', async () => {
    books.listBooks.mockResolvedValue(page([trip]))
    const budget = makeBudget({ scope: 'EVENT', book_id: trip.id, year: null, month: null })
    budgets.listBudgets.mockResolvedValue(page([budget]))

    renderBudgetsApp(PATH)

    expect(await screen.findByRole('link', { name: 'Open Goa Trip budget' })).toHaveAttribute(
      'href',
      `/budgets/${budget.id}`,
    )
  })

  it('loads event books across multiple pages so books beyond the first page can be selected', async () => {
    const tripPage2 = makeBook({
      id: '00000000-0000-4000-8000-0000000000e3',
      name: 'Shimla Trip',
      type: 'EVENT',
    })
    books.listBooks
      .mockResolvedValueOnce({
        count: 2,
        next: 'http://test/?page=2',
        previous: null,
        results: [trip],
      })
      .mockResolvedValueOnce({
        count: 2,
        next: null,
        previous: 'http://test/?page=1',
        results: [tripPage2],
      })
    budgets.listBudgets.mockResolvedValue(EMPTY_PAGE)
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await screen.findByText('No event budgets yet')
    await user.click(screen.getByRole('button', { name: 'Add event budget' }))

    const dialog = await screen.findByRole('dialog')
    const select = within(dialog).getByLabelText(/Event book/)
    expect(within(select).getByRole('option', { name: 'Goa Trip' })).toBeInTheDocument()
    expect(within(select).getByRole('option', { name: 'Shimla Trip' })).toBeInTheDocument()
  })
})
