import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/reports')
vi.mock('@/services/api/books')
vi.mock('@/services/api/categories')
vi.mock('@/services/api/paymentMethods')
vi.mock('@/services/api/transactions')
vi.mock('@/services/api/exports')
vi.mock('./download')

import { makeBook } from '@/features/books/testUtils'
import {
  apiError,
  makeBudget,
  makeReport,
  makeReportTransaction,
} from '@/features/budgets/testUtils'
import { makeCategory, makePaymentMethod } from '@/features/transactions/testUtils'
import * as booksApi from '@/services/api/books'
import * as categoriesApi from '@/services/api/categories'
import * as exportsApi from '@/services/api/exports'
import * as paymentMethodsApi from '@/services/api/paymentMethods'
import * as reportsApi from '@/services/api/reports'
import * as transactionsApi from '@/services/api/transactions'
import { downloadBlob } from './download'
import { makeBookReport, page, renderReportsApp } from './testUtils'

const reports = vi.mocked(reportsApi)
const books = vi.mocked(booksApi)
const categories = vi.mocked(categoriesApi)
const paymentMethods = vi.mocked(paymentMethodsApi)
const transactions = vi.mocked(transactionsApi)
const exportsService = vi.mocked(exportsApi)
const download = vi.mocked(downloadBlob)

const BOOK_ID = '00000000-0000-4000-8000-0000000000b1'
const CAT_ID = '10000000-0000-4000-8000-0000000000c1'
const PM_ID = '30000000-0000-4000-8000-0000000000d1'

const goa = makeBook({ id: BOOK_ID, type: 'EVENT', name: 'Goa Trip' })
const archived = makeBook({ type: 'GENERAL', name: 'Old Stuff', is_archived: true })
const food = makeCategory({ id: CAT_ID, name: 'Food', type: 'EXPENSE' })
const upi = makePaymentMethod({ id: PM_ID, name: 'UPI' })

const CSV_FILE = { blob: new Blob(['id\r\n']), filename: 'transactions.csv' }

function lastListParams() {
  const calls = transactions.listTransactions.mock.calls
  return calls[calls.length - 1][0]
}

function lastExportParams() {
  const calls = exportsService.exportTransactionsCsv.mock.calls
  return calls[calls.length - 1][0]
}

beforeEach(() => {
  vi.resetAllMocks()
  reports.getMonthlyReport.mockImplementation(async (year, month) =>
    makeReport({ period: { year, month } }),
  )
  reports.getBookReport.mockResolvedValue(makeBookReport())
  books.listBooks.mockResolvedValue(page([goa, archived]))
  categories.listCategories.mockResolvedValue(page([food]))
  paymentMethods.listPaymentMethods.mockResolvedValue(page([upi]))
  transactions.listTransactions.mockResolvedValue(
    page([makeReportTransaction({ book_id: BOOK_ID, description: 'Lunch' })]),
  )
  exportsService.exportTransactionsCsv.mockResolvedValue(CSV_FILE)
})

async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /^filters/i }))
}

describe('ReportsPage — combined monthly report', () => {
  it('requests the report for the month in the URL and renders server totals verbatim', async () => {
    reports.getMonthlyReport.mockImplementation(async (year, month) =>
      makeReport({
        period: { year, month },
        income_total: '1234567.89',
        expense_total: '0.10',
        net_cash_flow: '1234567.79',
      }),
    )

    renderReportsApp('/reports?year=2026&month=10')

    expect(await screen.findByTestId('monthly-report')).toBeInTheDocument()
    expect(reports.getMonthlyReport).toHaveBeenCalledWith(2026, 10, expect.anything())
    expect(screen.getByTestId('selected-month')).toHaveTextContent('October 2026')
    expect(screen.getByTestId('kpi-income')).toHaveTextContent('₹12,34,567.89')
    expect(screen.getByTestId('kpi-expenses')).toHaveTextContent('₹0.10')
    expect(screen.getByTestId('kpi-net')).toHaveTextContent('₹12,34,567.79')
  })

  it('shows the book-type and category breakdowns and the budget block', async () => {
    renderReportsApp('/reports?year=2026&month=10')

    await screen.findByTestId('monthly-report')
    expect(screen.getByTestId('book-type-MONTHLY')).toHaveTextContent('₹10,000.00')
    expect(screen.getByTestId('book-type-EVENT')).toHaveTextContent('₹2,000.00')
    expect(screen.getByTestId('book-type-GENERAL')).toHaveTextContent('₹345.67')
    const rows = screen.getAllByTestId('category-row')
    expect(rows[0]).toHaveTextContent('Food')
    expect(rows[1]).toHaveTextContent('Uncategorised')
    expect(screen.getByText('Monthly budget')).toBeInTheDocument()
  })

  it('flags a negative net cash flow with text', async () => {
    reports.getMonthlyReport.mockResolvedValue(
      makeReport({ income_total: '100.00', expense_total: '350.00', net_cash_flow: '-250.00' }),
    )

    renderReportsApp('/reports?year=2026&month=10')

    expect(await screen.findByTestId('kpi-net')).toHaveTextContent('-₹250.00')
    expect(screen.getByText(/Negative — expenses exceeded income/)).toBeInTheDocument()
  })

  it('shows historical months with the selected one marked and loads the six months', async () => {
    renderReportsApp('/reports?year=2026&month=10')

    const history = await screen.findByRole('table', {
      name: 'Income, expenses and net cash flow by month',
    })
    await waitFor(() => expect(within(history).getAllByRole('row')).toHaveLength(7))
    expect(screen.getByTestId('history-2026-10')).toHaveTextContent('(selected)')
    expect(screen.getByTestId('history-2026-5')).toBeInTheDocument()
    const requested = reports.getMonthlyReport.mock.calls.map((c) => `${c[0]}-${c[1]}`)
    expect(requested).toEqual(
      expect.arrayContaining(['2026-10', '2026-9', '2026-8', '2026-7', '2026-6', '2026-5']),
    )
  })

  it('rolls the history across a year boundary', async () => {
    renderReportsApp('/reports?year=2026&month=2')

    await screen.findByTestId('history-2025-12')
    expect(screen.getByTestId('history-2025-11')).toBeInTheDocument()
  })

  it('selecting a historical month updates the URL and reloads the report', async () => {
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10')
    await screen.findByTestId('history-2026-9')

    await user.click(await screen.findByRole('button', { name: 'Show September 2026' }))

    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/reports?year=2026&month=9',
      ),
    )
    expect(screen.getByTestId('selected-month')).toHaveTextContent('September 2026')
    expect(lastListParams()).toMatchObject({ date_from: '2026-09-01', date_to: '2026-09-30' })
  })

  it('month navigation changes the list and export date bounds', async () => {
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=12')
    await screen.findByTestId('monthly-report')

    await user.click(screen.getByRole('button', { name: 'Next month' }))

    await waitFor(() => expect(screen.getByTestId('selected-month')).toHaveTextContent('January 2027'))
    expect(lastListParams()).toMatchObject({ date_from: '2027-01-01', date_to: '2027-01-31' })
    expect(screen.getByText('Dates: January 2027')).toBeInTheDocument()
  })

  it('shows a loading skeleton and no zero KPIs while loading', () => {
    reports.getMonthlyReport.mockReturnValue(new Promise(() => undefined))

    renderReportsApp('/reports?year=2026&month=10')

    expect(screen.getByLabelText(/Loading October 2026/)).toBeInTheDocument()
    expect(screen.queryByTestId('kpi-income')).not.toBeInTheDocument()
  })

  it('shows an error with Retry that refetches the report', async () => {
    reports.getMonthlyReport
      .mockRejectedValueOnce(apiError('forbidden', 'Not allowed'))
      .mockImplementation(async (year, month) => makeReport({ period: { year, month } }))
    const user = userEvent.setup()

    renderReportsApp('/reports?year=2026&month=10')

    const alert = await screen.findByText('Not allowed')
    await user.click(within(alert.closest('[role="alert"]') as HTMLElement).getByRole('button', { name: /retry/i }))

    expect(await screen.findByTestId('kpi-income')).toBeInTheDocument()
  })

  it('shows zero totals for an empty month and the empty transactions state', async () => {
    reports.getMonthlyReport.mockResolvedValue(
      makeReport({
        income_total: '0.00',
        expense_total: '0.00',
        net_cash_flow: '0.00',
        category_breakdown: [],
        recent_transactions: [],
      }),
    )
    transactions.listTransactions.mockResolvedValue(page([]))

    renderReportsApp('/reports?year=2026&month=10')

    expect(await screen.findByTestId('kpi-income')).toHaveTextContent('₹0.00')
    expect(await screen.findByText('No transactions in this scope')).toBeInTheDocument()
    expect(screen.getByText('No expenses recorded for this month.')).toBeInTheDocument()
  })

  it('defaults to the current month in the user timezone when no month is in the URL', async () => {
    renderReportsApp('/reports')

    await screen.findByTestId('monthly-report')
    const [year, month] = reports.getMonthlyReport.mock.calls[0]
    expect(year).toBeGreaterThanOrEqual(2026)
    expect(month).toBeGreaterThanOrEqual(1)
    expect(month).toBeLessThanOrEqual(12)
  })
})

describe('ReportsPage — book report', () => {
  it('uses GET /reports/books/{id}/ for a selected book and not the monthly report', async () => {
    renderReportsApp(`/reports?bookId=${BOOK_ID}`)

    const report = await screen.findByTestId('book-report')
    expect(reports.getBookReport).toHaveBeenCalledWith(BOOK_ID, expect.anything())
    expect(reports.getMonthlyReport).not.toHaveBeenCalled()
    expect(within(report).getByRole('heading', { name: 'Goa Trip' })).toBeInTheDocument()
    expect(screen.getByTestId('kpi-income')).toHaveTextContent('₹1,000.00')
    expect(screen.getByTestId('kpi-expenses')).toHaveTextContent('₹2,500.50')
    expect(screen.getByTestId('kpi-net')).toHaveTextContent('-₹1,500.50')
    expect(screen.getByTestId('kpi-closing')).toHaveTextContent('-₹1,400.50')
    expect(screen.queryByTestId('selected-month')).not.toBeInTheDocument()
  })

  it('lists the book transactions across all dates (no date bounds)', async () => {
    renderReportsApp(`/reports?bookId=${BOOK_ID}`)

    await screen.findByTestId('book-report')
    await waitFor(() => expect(transactions.listTransactions).toHaveBeenCalled())
    const params = lastListParams()
    expect(params).toMatchObject({ book_id: BOOK_ID })
    expect(params).not.toHaveProperty('date_from')
    expect(params).not.toHaveProperty('date_to')
  })

  it('renders the event budget when the report includes one', async () => {
    reports.getBookReport.mockResolvedValue(
      makeBookReport({ budget: makeBudget({ scope: 'EVENT', book_id: BOOK_ID, year: null, month: null }) }),
    )

    renderReportsApp(`/reports?bookId=${BOOK_ID}`)

    expect(await screen.findByRole('heading', { name: 'Event budget' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'View budget details' })).toBeInTheDocument()
  })

  it('labels archived books as read only and still reports them', async () => {
    reports.getBookReport.mockResolvedValue(
      makeBookReport({ book: { id: BOOK_ID, type: 'GENERAL', name: 'Old Stuff', is_archived: true } }),
    )

    renderReportsApp(`/reports?bookId=${BOOK_ID}`)

    expect(await screen.findByText(/Archived book — read only/)).toBeInTheDocument()
  })

  it('shows a generic not-found state for an inaccessible book and can switch back to all books', async () => {
    reports.getBookReport.mockRejectedValue(apiError('not_found', 'Not found.'))
    const user = userEvent.setup()

    renderReportsApp(`/reports?bookId=${BOOK_ID}`)

    expect(await screen.findByRole('heading', { name: 'Book not found' })).toBeInTheDocument()
    expect(transactions.listTransactions).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Report on all books' }))

    expect(await screen.findByTestId('monthly-report')).toBeInTheDocument()
  })

  it('treats a malformed book id as not found without calling the API', () => {
    renderReportsApp('/reports?bookId=not-a-uuid')

    expect(screen.getByRole('heading', { name: 'Book not found' })).toBeInTheDocument()
    expect(reports.getBookReport).not.toHaveBeenCalled()
    expect(transactions.listTransactions).not.toHaveBeenCalled()
  })

  it('shows an error with Retry when the book report fails', async () => {
    reports.getBookReport
      .mockRejectedValueOnce(apiError('forbidden', 'Report unavailable'))
      .mockResolvedValueOnce(makeBookReport())
    const user = userEvent.setup()

    renderReportsApp(`/reports?bookId=${BOOK_ID}`)

    const alert = (await screen.findByText('Report unavailable')).closest('[role="alert"]') as HTMLElement
    await user.click(within(alert).getByRole('button', { name: /retry/i }))

    expect(await screen.findByTestId('book-report')).toBeInTheDocument()
  })

  it('selecting a book from the scope control switches to that book report', async () => {
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10')
    await screen.findByTestId('monthly-report')
    await screen.findByRole('option', { name: 'Goa Trip' })

    await user.selectOptions(screen.getByLabelText('Book'), BOOK_ID)

    expect(await screen.findByTestId('book-report')).toBeInTheDocument()
    expect(screen.getByTestId('location')).toHaveTextContent(`bookId=${BOOK_ID}`)
    expect(screen.queryByRole('option', { name: 'Selected month' })).not.toBeInTheDocument()
  })

  it('lists archived books in the selector with an archived suffix', async () => {
    renderReportsApp('/reports')

    expect(await screen.findByRole('option', { name: 'Old Stuff (archived)' })).toBeInTheDocument()
  })

  it('keeps working when the books list fails', async () => {
    books.listBooks.mockRejectedValue(apiError('forbidden', 'nope'))

    renderReportsApp('/reports?year=2026&month=10')

    expect(await screen.findByText(/Could not load your books/)).toBeInTheDocument()
    expect(await screen.findByTestId('monthly-report')).toBeInTheDocument()
  })
})

describe('ReportsPage — transaction search and filters', () => {
  it('lists transactions for the month with the source book label', async () => {
    renderReportsApp('/reports?year=2026&month=10')

    expect(await screen.findByText('Lunch')).toBeInTheDocument()
    expect(lastListParams()).toEqual({
      date_from: '2026-10-01',
      date_to: '2026-10-31',
      ordering: '-transaction_date',
      page: 1,
    })
    expect(await screen.findByRole('link', { name: 'Goa Trip' })).toHaveAttribute(
      'href',
      `/books/${BOOK_ID}`,
    )
    expect(screen.getByTestId('transaction-count')).toHaveTextContent('1')
  })

  it('reuses the transaction filters and sends type/category/method/search to the list', async () => {
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10')
    await screen.findByText('Lunch')
    await openFilters(user)

    await user.selectOptions(screen.getByLabelText('Type'), 'EXPENSE')
    await screen.findByRole('option', { name: 'Food (expense)' })
    await user.selectOptions(screen.getByLabelText('Category'), CAT_ID)
    await user.selectOptions(screen.getByLabelText('Payment Method'), PM_ID)
    await user.type(screen.getByLabelText('Search notes'), 'tea')

    await waitFor(() =>
      expect(lastListParams()).toEqual({
        type: 'EXPENSE',
        category_id: CAT_ID,
        payment_method_id: PM_ID,
        date_from: '2026-10-01',
        date_to: '2026-10-31',
        search: 'tea',
        ordering: '-transaction_date',
        page: 1,
      }),
    )
    expect(screen.getByTestId('location').textContent).toContain('type=EXPENSE')
    expect(screen.getByTestId('location').textContent).toContain('search=tea')
  })

  it('does not show duplicate From/To inputs inside the filter panel (dates belong to the scope)', async () => {
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10')
    await screen.findByText('Lunch')

    await openFilters(user)

    expect(screen.queryByLabelText('From Date')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('To Date')).not.toBeInTheDocument()
  })

  it('restores filters from the URL (deep link) and shows them in the export summary', async () => {
    renderReportsApp(
      `/reports?year=2026&month=10&type=INCOME&categoryId=${CAT_ID}&paymentMethodId=${PM_ID}&search=pay`,
    )

    await waitFor(() =>
      expect(lastListParams()).toMatchObject({
        type: 'INCOME',
        category_id: CAT_ID,
        payment_method_id: PM_ID,
        search: 'pay',
      }),
    )
    const summary = screen.getByRole('list', { name: 'Export scope and filters' })
    expect(within(summary).getByText('Type: Income')).toBeInTheDocument()
    expect(await within(summary).findByText('Category: Food')).toBeInTheDocument()
    expect(await within(summary).findByText('Payment method: UPI')).toBeInTheDocument()
    expect(within(summary).getByText('Search: “pay”')).toBeInTheDocument()
    expect(screen.getByLabelText('Search notes')).toHaveValue('pay')
  })

  it('shows a no-matches state with working Clear filters', async () => {
    transactions.listTransactions.mockImplementation(async (params = {}) =>
      params.search ? page([]) : page([makeReportTransaction({ description: 'Lunch' })]),
    )
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10&search=zzz')

    expect(await screen.findByText('No matching transactions')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])

    expect(await screen.findByText('Lunch')).toBeInTheDocument()
    expect(screen.getByTestId('location').textContent).not.toContain('search=')
  })

  it('shows an error with Retry when the transactions fail to load', async () => {
    transactions.listTransactions
      .mockRejectedValueOnce(apiError('forbidden', 'List unavailable'))
      .mockResolvedValue(page([makeReportTransaction({ description: 'Lunch' })]))
    const user = userEvent.setup()

    renderReportsApp('/reports?year=2026&month=10')

    const alert = (await screen.findByText('List unavailable')).closest('[role="alert"]') as HTMLElement
    await user.click(within(alert).getByRole('button', { name: /retry/i }))

    expect(await screen.findByText('Lunch')).toBeInTheDocument()
  })

  it('paginates with the shared pagination control and keeps the page in the URL', async () => {
    transactions.listTransactions.mockResolvedValue(
      page([makeReportTransaction({ description: 'Lunch' })], { next: 'http://x/?page=2' }),
    )
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10')
    await screen.findByText('Lunch')

    await user.click(screen.getByRole('button', { name: 'Next page' }))

    await waitFor(() => expect(lastListParams()).toMatchObject({ page: 2 }))
    expect(screen.getByTestId('location').textContent).toContain('page=2')
  })

  it('changing a filter resets to page 1', async () => {
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10&page=3')
    await openFilters(user)

    await user.selectOptions(screen.getByLabelText('Type'), 'INCOME')

    await waitFor(() => expect(lastListParams()).toMatchObject({ type: 'INCOME', page: 1 }))
  })
})

describe('ReportsPage — date scope', () => {
  it('"All dates" without a book sends no date bounds and explains that totals are unavailable', async () => {
    renderReportsApp('/reports?period=all')

    await screen.findByText('Lunch')
    const params = lastListParams()
    expect(params).not.toHaveProperty('date_from')
    expect(params).not.toHaveProperty('date_to')
    expect(screen.getByTestId('no-totals-note')).toBeInTheDocument()
    expect(reports.getMonthlyReport).not.toHaveBeenCalled()
    expect(screen.getByText('Dates: all dates')).toBeInTheDocument()
  })

  it('a custom range sends date_from/date_to to the list', async () => {
    renderReportsApp('/reports?period=range&dateFrom=2026-10-05&dateTo=2026-10-20')

    await screen.findByText('Lunch')
    expect(lastListParams()).toMatchObject({ date_from: '2026-10-05', date_to: '2026-10-20' })
    expect(screen.getByLabelText('Report from date')).toHaveValue('2026-10-05')
    expect(screen.getByText('Dates: 5 Oct 2026 to 20 Oct 2026')).toBeInTheDocument()
  })

  it('switching scope with the Dates control updates the URL', async () => {
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10')
    await screen.findByTestId('monthly-report')

    await user.selectOptions(screen.getByLabelText('Dates'), 'range')

    expect(screen.getByTestId('location').textContent).toContain('period=range')
    expect(screen.getByLabelText('Report from date')).toBeInTheDocument()
    expect(screen.queryByTestId('monthly-report')).not.toBeInTheDocument()
  })

  it('an inverted range blocks the list and the export with a clear message', async () => {
    renderReportsApp('/reports?period=range&dateFrom=2026-10-20&dateTo=2026-10-05')

    expect(await screen.findByText('The start date must be on or before the end date.')).toBeInTheDocument()
    expect(screen.getByText('Fix the date range before exporting.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    expect(transactions.listTransactions).not.toHaveBeenCalled()
  })

  it('can return from a non-total scope to monthly totals', async () => {
    const user = userEvent.setup()
    renderReportsApp('/reports?period=all')
    await screen.findByTestId('no-totals-note')

    await user.click(screen.getByRole('button', { name: 'Show monthly totals' }))

    expect(await screen.findByTestId('monthly-report')).toBeInTheDocument()
  })
})

describe('ReportsPage — CSV export', () => {
  it('exports with exactly the filters used by the list (minus ordering and page) and downloads the file', async () => {
    const user = userEvent.setup()
    renderReportsApp(
      `/reports?year=2026&month=10&type=EXPENSE&categoryId=${CAT_ID}&paymentMethodId=${PM_ID}&search=tea&ordering=-amount&page=2`,
    )
    await waitFor(() => expect(lastListParams()).toMatchObject({ search: 'tea', page: 2 }))
    const listParams = { ...lastListParams() }

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => expect(exportsService.exportTransactionsCsv).toHaveBeenCalledTimes(1))
    const { ordering, page: pageNo, ...expected } = listParams
    expect(ordering).toBe('-amount')
    expect(pageNo).toBe(2)
    expect(lastExportParams()).toEqual(expected)
    expect(lastExportParams()).toEqual({
      type: 'EXPENSE',
      category_id: CAT_ID,
      payment_method_id: PM_ID,
      search: 'tea',
      date_from: '2026-10-01',
      date_to: '2026-10-31',
    })
    await waitFor(() => expect(download).toHaveBeenCalledWith(CSV_FILE.blob, 'transactions.csv'))
    expect(await screen.findByText('Exported transactions.csv.')).toBeInTheDocument()
    expect(screen.getByText('transactions.csv', { selector: 'span' })).toBeInTheDocument()
  })

  it('exports a single book across all dates', async () => {
    const user = userEvent.setup()
    renderReportsApp(`/reports?bookId=${BOOK_ID}`)
    await screen.findByTestId('book-report')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => expect(exportsService.exportTransactionsCsv).toHaveBeenCalled())
    expect(lastExportParams()).toEqual({ book_id: BOOK_ID })
  })

  it('exports a custom range', async () => {
    const user = userEvent.setup()
    renderReportsApp('/reports?period=range&dateFrom=2026-10-05&dateTo=2026-10-20')
    await screen.findByText('Lunch')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => expect(exportsService.exportTransactionsCsv).toHaveBeenCalled())
    expect(lastExportParams()).toEqual({ date_from: '2026-10-05', date_to: '2026-10-20' })
  })

  it('shows the scope and filter summary beside the button', async () => {
    renderReportsApp(`/reports?bookId=${BOOK_ID}&type=INCOME`)

    const summary = await screen.findByRole('list', { name: 'Export scope and filters' })
    expect(await within(summary).findByText('Book: Goa Trip')).toBeInTheDocument()
    expect(within(summary).getByText('Dates: all dates')).toBeInTheDocument()
    expect(within(summary).getByText('Type: Income')).toBeInTheDocument()
  })

  it('disables the button and shows progress while exporting, preventing duplicate requests', async () => {
    exportsService.exportTransactionsCsv.mockReturnValue(new Promise(() => undefined))
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10')
    await screen.findByText('Lunch')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    const busy = await screen.findByRole('button', { name: 'Exporting…' })
    expect(busy).toBeDisabled()
    await user.click(busy)
    expect(exportsService.exportTransactionsCsv).toHaveBeenCalledTimes(1)
    expect(download).not.toHaveBeenCalled()
  })

  it('shows an error alert on failure, keeps filters and the list, and Retry succeeds', async () => {
    exportsService.exportTransactionsCsv
      .mockRejectedValueOnce(apiError('network_error', 'Network down'))
      .mockResolvedValueOnce(CSV_FILE)
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10&type=EXPENSE&search=tea')
    await screen.findByText('Lunch')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    const alert = await screen.findByText(/offline or the server can't be reached/i)
    expect(alert.closest('[role="alert"]')).toBeInTheDocument()
    expect(download).not.toHaveBeenCalled()
    // Filters, list and scope are intact after the failure.
    expect(screen.getByText('Lunch')).toBeInTheDocument()
    expect(screen.getByLabelText('Search notes')).toHaveValue('tea')
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Retry export' }))

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    expect(exportsService.exportTransactionsCsv).toHaveBeenCalledTimes(2)
    expect(lastExportParams()).toMatchObject({ type: 'EXPENSE', search: 'tea' })
    expect(screen.queryByRole('button', { name: 'Retry export' })).not.toBeInTheDocument()
  })

  it('surfaces a server validation message from the export endpoint', async () => {
    exportsService.exportTransactionsCsv.mockRejectedValue(
      apiError('validation_error', 'Enter a valid date.'),
    )
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10')
    await screen.findByText('Lunch')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    expect(await screen.findByText('Enter a valid date.')).toBeInTheDocument()
  })

  it('clears a previous export error when the scope changes', async () => {
    exportsService.exportTransactionsCsv.mockRejectedValue(apiError('validation_error', 'Nope'))
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10')
    await screen.findByText('Lunch')
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    await screen.findByText('Nope')

    await user.click(screen.getByRole('button', { name: 'Previous month' }))

    await waitFor(() => expect(screen.queryByText('Nope')).not.toBeInTheDocument())
  })

  it('never generates CSV in the browser: the only data source is the export service', async () => {
    const user = userEvent.setup()
    renderReportsApp('/reports?year=2026&month=10')
    await screen.findByText('Lunch')

    await user.click(screen.getByRole('button', { name: 'Export CSV' }))

    await waitFor(() => expect(download).toHaveBeenCalledTimes(1))
    // The blob handed to the browser is the one returned by the service, unchanged.
    expect(download.mock.calls[0][0]).toBe(CSV_FILE.blob)
  })
})

describe('Reports entry points', () => {
  it('the Reports page heading and landmark structure render', async () => {
    renderReportsApp('/reports?year=2026&month=10')

    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument()
    await screen.findByTestId('monthly-report')
    expect(screen.getByRole('region', { name: 'Report scope' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Transactions' })).toBeInTheDocument()
  })
})
