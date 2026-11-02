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
  makeAllocation,
  makeBudget,
  renderBudgetsApp,
} from '@/features/budgets/testUtils'
import * as booksApi from '@/services/api/books'
import * as budgetsApi from '@/services/api/budgets'
import * as categoriesApi from '@/services/api/categories'
import type { Category } from '@/types'

const budgets = vi.mocked(budgetsApi)
const books = vi.mocked(booksApi)
const categories = vi.mocked(categoriesApi)

const FOOD = '10000000-0000-4000-8000-0000000000f1'
const TRAVEL = '10000000-0000-4000-8000-0000000000f2'
const RENT = '10000000-0000-4000-8000-0000000000f3'

function category(id: string, name: string, overrides: Partial<Category> = {}): Category {
  return { id, name, type: 'EXPENSE', is_default: false, is_active: true, ...overrides }
}

function page<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results }
}

const base = makeBudget({ total_limit: '1000.00', unallocated: '1000.00' })
const PATH = `/budgets/${base.id}`

beforeEach(() => {
  vi.resetAllMocks()
  budgets.getBudget.mockResolvedValue(base)
  categories.listCategories.mockResolvedValue(
    page([category(FOOD, 'Food'), category(TRAVEL, 'Travel'), category(RENT, 'Rent')]),
  )
})

async function openEditor() {
  await screen.findByRole('form', { name: 'Category allocations' })
}

describe('BudgetDetailsPage — states', () => {
  it('treats a non-UUID id as not found without calling the API', () => {
    renderBudgetsApp('/budgets/not-a-uuid')

    expect(screen.getByRole('heading', { name: 'Budget not found' })).toBeInTheDocument()
    expect(budgets.getBudget).not.toHaveBeenCalled()
  })

  it('shows not found for a 404 without leaking details', async () => {
    budgets.getBudget.mockRejectedValue(apiError('not_found', 'Budget 123 of someone else'))

    renderBudgetsApp(PATH)

    expect(await screen.findByRole('heading', { name: 'Budget not found' })).toBeInTheDocument()
    expect(screen.queryByText(/someone else/)).not.toBeInTheDocument()
  })

  it('shows a loading skeleton', () => {
    budgets.getBudget.mockReturnValue(new Promise(() => undefined))

    renderBudgetsApp(PATH)

    expect(screen.getByLabelText('Loading budget')).toBeInTheDocument()
  })

  it('shows an error with retry for other failures', async () => {
    budgets.getBudget
      .mockRejectedValueOnce(apiError('forbidden', 'Denied'))
      .mockResolvedValueOnce(base)
    const user = userEvent.setup()

    renderBudgetsApp(PATH)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Denied')
    await user.click(within(alert).getByRole('button', { name: 'Retry' }))

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(
      'Overall monthly budget — October 2026',
    )
  })
})

describe('BudgetDetailsPage — views', () => {
  it('renders the monthly budget, server figures and the allocation breakdown', async () => {
    const food = makeAllocation({
      category: { id: FOOD, name: 'Food', type: 'EXPENSE', is_active: true },
      amount: '400.00',
      spent: '450.00',
      remaining: '-50.00',
      utilization_percent: '112.50',
      status: 'OVER_BUDGET',
    })
    budgets.getBudget.mockResolvedValue(
      makeBudget({
        id: base.id,
        total_limit: '1000.00',
        allocations: [food],
        allocated_total: '400.00',
        unallocated: '600.00',
        spent: '700.00',
        remaining: '300.00',
        utilization_percent: '70.00',
        unallocated_spent: '250.00',
        uncategorised_spent: '100.00',
      }),
    )

    renderBudgetsApp(PATH)

    expect(await screen.findByTestId('total-limit')).toHaveTextContent('₹1,000.00')
    expect(screen.getByTestId('allocated-total')).toHaveTextContent('₹400.00')
    expect(screen.getByTestId('unallocated')).toHaveTextContent('₹600.00')
    expect(screen.getByTestId('unallocated-spent')).toHaveTextContent('₹250.00')
    expect(screen.getByTestId('uncategorised')).toHaveTextContent('₹100.00')
    const row = screen.getByTestId('allocation-progress')
    expect(row).toHaveTextContent('Food')
    expect(within(row).getByTestId('budget-progress')).toHaveAttribute('data-status', 'OVER_BUDGET')
    expect(within(row).getByTestId('budget-summary')).toHaveTextContent('₹50.00 over budget · 112.50%')
  })

  it('shows the empty allocation message', async () => {
    renderBudgetsApp(PATH)

    expect(await screen.findByText(/No category allocations yet/)).toBeInTheDocument()
    expect(screen.getByText(/No allocations\. Add a category/)).toBeInTheDocument()
  })

  it('shows an event budget with its book name and event wording', async () => {
    const trip = makeBook({ id: '00000000-0000-4000-8000-0000000000e1', name: 'Goa Trip', type: 'EVENT' })
    budgets.getBudget.mockResolvedValue(
      makeBudget({ id: base.id, scope: 'EVENT', book_id: trip.id, year: null, month: null }),
    )
    books.getBook.mockResolvedValue(trip)

    renderBudgetsApp(PATH)

    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Event budget')
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Event budget — Goa Trip'),
    )
    expect(books.getBook).toHaveBeenCalledWith(trip.id, expect.anything())
    expect(screen.getByText(/in this event book, on any date/)).toBeInTheDocument()
  })

  it('labels inactive allocation categories', async () => {
    const old = makeAllocation({
      category: { id: RENT, name: 'Rent', type: 'EXPENSE', is_active: false },
      amount: '100.00',
    })
    budgets.getBudget.mockResolvedValue(
      makeBudget({ id: base.id, total_limit: '1000.00', allocations: [old], allocated_total: '100.00' }),
    )

    renderBudgetsApp(PATH)

    const row = await screen.findByTestId('allocation-progress')
    expect(row).toHaveTextContent('Rent (Inactive)')
  })
})

describe('BudgetDetailsPage — allocation editor', () => {
  it('adds allocations, saves with PUT, toasts and invalidates budgets and reports', async () => {
    const saved = makeBudget({
      id: base.id,
      total_limit: '1000.00',
      allocations: [
        makeAllocation({ category: { id: FOOD, name: 'Food', type: 'EXPENSE', is_active: true }, amount: '300.00' }),
        makeAllocation({ category: { id: TRAVEL, name: 'Travel', type: 'EXPENSE', is_active: true }, amount: '200.5' }),
      ],
      allocated_total: '500.50',
      unallocated: '499.50',
    })
    budgets.replaceAllocations.mockResolvedValue(saved)
    const client = createTestQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const user = userEvent.setup()

    renderBudgetsApp(PATH, { client })
    await openEditor()

    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.selectOptions(screen.getByLabelText('Category 1'), FOOD)
    await user.type(screen.getByLabelText('Amount 1 (₹)'), '300')
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.selectOptions(screen.getByLabelText('Category 2'), TRAVEL)
    await user.type(screen.getByLabelText('Amount 2 (₹)'), '200.5')

    expect(screen.getByTestId('live-total')).toHaveTextContent('₹500.50')
    expect(screen.getByTestId('live-unallocated')).toHaveTextContent('₹499.50')

    await user.click(screen.getByRole('button', { name: 'Save allocations' }))

    await waitFor(() =>
      expect(budgets.replaceAllocations).toHaveBeenCalledWith(base.id, [
        { category_id: FOOD, amount: '300.00' },
        { category_id: TRAVEL, amount: '200.50' },
      ]),
    )
    expect(await screen.findByText('Allocations saved.')).toBeInTheDocument()
    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey)
    expect(keys).toContainEqual(['budgets', 'list'])
    expect(keys).toContainEqual(['reports'])
    expect(client.getQueryData(['budgets', 'detail', base.id])).toEqual(saved)
    // The editor re-syncs to the persisted state and the progress list reflects the server.
    await waitFor(() => expect(screen.getAllByTestId('allocation-row')).toHaveLength(2))
    expect(screen.getByTestId('allocated-total')).toHaveTextContent('₹500.50')
  })

  it('disables categories already used by another row', async () => {
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.selectOptions(screen.getByLabelText('Category 1'), FOOD)
    await user.click(screen.getByRole('button', { name: 'Add category' }))

    const second = screen.getByLabelText('Category 2')
    expect(within(second).getByRole('option', { name: 'Food' })).toBeDisabled()
    expect(within(second).getByRole('option', { name: 'Travel' })).toBeEnabled()
  })

  it('requires a category and blocks the request', async () => {
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.type(screen.getByLabelText('Amount 1 (₹)'), '10')
    await user.click(screen.getByRole('button', { name: 'Save allocations' }))

    expect(await screen.findByText('Select a category.')).toBeInTheDocument()
    expect(screen.getByLabelText('Category 1')).toHaveAttribute('aria-invalid', 'true')
    expect(budgets.replaceAllocations).not.toHaveBeenCalled()
  })

  it('rejects negative and malformed amounts with accessible messages', async () => {
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.selectOptions(screen.getByLabelText('Category 1'), FOOD)
    const amount = screen.getByLabelText('Amount 1 (₹)')

    await user.type(amount, '-5')
    await user.click(screen.getByRole('button', { name: 'Save allocations' }))
    expect(await screen.findByText('Amount cannot be negative.')).toBeInTheDocument()
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(amount).toHaveAccessibleDescription('Amount cannot be negative.')

    await user.clear(amount)
    await user.type(amount, '1.999')
    await user.click(screen.getByRole('button', { name: 'Save allocations' }))
    expect(await screen.findByText(/at most 2 decimal places/)).toBeInTheDocument()
    expect(budgets.replaceAllocations).not.toHaveBeenCalled()
  })

  it('blocks a total above the limit on the client and warns live', async () => {
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.selectOptions(screen.getByLabelText('Category 1'), FOOD)
    await user.type(screen.getByLabelText('Amount 1 (₹)'), '1000.01')

    expect(screen.getByTestId('live-unallocated')).toHaveTextContent('-₹0.01')
    expect(screen.getAllByText(/exceeds the budget total limit/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Save allocations' }))
    expect(budgets.replaceAllocations).not.toHaveBeenCalled()
  })

  it('allows a total exactly equal to the limit', async () => {
    budgets.replaceAllocations.mockResolvedValue(base)
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.selectOptions(screen.getByLabelText('Category 1'), FOOD)
    await user.type(screen.getByLabelText('Amount 1 (₹)'), '1000')
    expect(screen.getByTestId('live-unallocated')).toHaveTextContent('₹0.00')
    await user.click(screen.getByRole('button', { name: 'Save allocations' }))

    await waitFor(() =>
      expect(budgets.replaceAllocations).toHaveBeenCalledWith(base.id, [
        { category_id: FOOD, amount: '1000.00' },
      ]),
    )
  })

  it('allows a zero allocation', async () => {
    budgets.replaceAllocations.mockResolvedValue(base)
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.selectOptions(screen.getByLabelText('Category 1'), FOOD)
    await user.type(screen.getByLabelText('Amount 1 (₹)'), '0')
    await user.click(screen.getByRole('button', { name: 'Save allocations' }))

    await waitFor(() =>
      expect(budgets.replaceAllocations).toHaveBeenCalledWith(base.id, [
        { category_id: FOOD, amount: '0.00' },
      ]),
    )
  })

  it('clears every allocation by saving an empty list', async () => {
    const existing = makeAllocation({
      category: { id: FOOD, name: 'Food', type: 'EXPENSE', is_active: true },
      amount: '100.00',
    })
    budgets.getBudget.mockResolvedValue(
      makeBudget({ id: base.id, total_limit: '1000.00', allocations: [existing], allocated_total: '100.00' }),
    )
    budgets.replaceAllocations.mockResolvedValue(base)
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await openEditor()
    expect(screen.getAllByTestId('allocation-row')).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: 'Remove allocation 1' }))
    await user.click(screen.getByRole('button', { name: 'Save allocations' }))

    await waitFor(() => expect(budgets.replaceAllocations).toHaveBeenCalledWith(base.id, []))
    expect(await screen.findByText('Allocations saved.')).toBeInTheDocument()
  })

  it('shows server per-item errors on the matching row and preserves input', async () => {
    budgets.replaceAllocations.mockRejectedValue(
      apiError('validation_error', 'Invalid', {
        allocations: { '0': { category_id: ['Category is inactive.'] } },
      }),
    )
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.selectOptions(screen.getByLabelText('Category 1'), FOOD)
    await user.type(screen.getByLabelText('Amount 1 (₹)'), '50')
    await user.click(screen.getByRole('button', { name: 'Save allocations' }))

    expect(await screen.findByText('Category is inactive.')).toBeInTheDocument()
    expect(screen.getByLabelText('Amount 1 (₹)')).toHaveValue('50')
    expect(screen.getByLabelText('Category 1')).toHaveValue(FOOD)
    expect(screen.queryByText('Allocations saved.')).not.toBeInTheDocument()
  })

  it('shows the server total-limit error as a form alert and preserves input', async () => {
    budgets.replaceAllocations.mockRejectedValue(
      apiError('validation_error', 'Invalid', {
        allocations: ['Allocation total exceeds the budget total limit.'],
      }),
    )
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.selectOptions(screen.getByLabelText('Category 1'), FOOD)
    await user.type(screen.getByLabelText('Amount 1 (₹)'), '50')
    await user.click(screen.getByRole('button', { name: 'Save allocations' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Allocation total exceeds the budget total limit.')
    expect(screen.getByLabelText('Amount 1 (₹)')).toHaveValue('50')
  })

  it('keeps the entered rows when the request fails for another reason', async () => {
    budgets.replaceAllocations.mockRejectedValue(apiError('network_error', 'offline'))
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await openEditor()
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    await user.selectOptions(screen.getByLabelText('Category 1'), FOOD)
    await user.type(screen.getByLabelText('Amount 1 (₹)'), '50')
    await user.click(screen.getByRole('button', { name: 'Save allocations' }))

    expect(await screen.findByText(/offline or the server can't be reached/)).toBeInTheDocument()
    expect(screen.getByLabelText('Amount 1 (₹)')).toHaveValue('50')
  })

  it('reports when expense categories fail to load, with retry', async () => {
    categories.listCategories
      .mockRejectedValueOnce(apiError('forbidden', 'No categories for you'))
      .mockResolvedValueOnce(page([category(FOOD, 'Food')]))
    const user = userEvent.setup()

    renderBudgetsApp(PATH)

    const message = await screen.findByText('No categories for you')
    await user.click(
      within(message.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: 'Retry' }),
    )
    expect(await screen.findByRole('form', { name: 'Category allocations' })).toBeInTheDocument()
    expect(categories.listCategories).toHaveBeenCalledWith(
      { type: 'EXPENSE', is_active: true },
      expect.anything(),
    )
  })
})

describe('BudgetDetailsPage — edit limit', () => {
  it('updates the limit via PATCH and toasts', async () => {
    budgets.updateBudget.mockResolvedValue({ ...base, total_limit: '2000.00' })
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await user.click(await screen.findByRole('button', { name: 'Edit limit' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText(/Total limit/)
    expect(input).toHaveValue('1000.00')
    await user.clear(input)
    await user.type(input, '2000')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() =>
      expect(budgets.updateBudget).toHaveBeenCalledWith(base.id, { total_limit: '2000.00' }),
    )
    expect(await screen.findByText('Budget limit updated.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps the dialog open with the server message when the limit is below the allocated total', async () => {
    budgets.updateBudget.mockRejectedValue(
      apiError('validation_error', 'Invalid', {
        total_limit: ['Total limit cannot be lower than allocated total.'],
      }),
    )
    const user = userEvent.setup()

    renderBudgetsApp(PATH)
    await user.click(await screen.findByRole('button', { name: 'Edit limit' }))
    const dialog = await screen.findByRole('dialog')
    const input = within(dialog).getByLabelText(/Total limit/)
    await user.clear(input)
    await user.type(input, '5')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(
      await within(dialog).findByText('Total limit cannot be lower than allocated total.'),
    ).toBeInTheDocument()
    expect(input).toHaveValue('5')
  })
})
