/**
 * Monthly books: ensure-before-display, month navigation (incl. year
 * transitions), duplicate-request prevention, errors, and the absence of
 * create/edit/archive controls for MONTHLY books.
 */

import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/books')
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    initializing: false,
    user: { id: 'u1', email: 'a@b.c', display_name: 'A', timezone: 'UTC' },
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
}))

import * as booksApi from '@/services/api/books'
import { apiError, installFakeBackend, makeMonthlyBook, renderBooksApp } from './testUtils'

const mocked = vi.mocked(booksApi)

beforeEach(() => {
  vi.resetAllMocks()
  vi.useRealTimers()
})

describe('Monthly books — ensure flow', () => {
  it('ensures the selected month before showing its book', async () => {
    let release!: () => void
    installFakeBackend()
    mocked.ensureMonthlyBook.mockImplementation(
      (year, month) =>
        new Promise((resolve) => {
          release = () => resolve({ book: makeMonthlyBook(year, month), created: true })
        }),
    )

    renderBooksApp('/books?tab=monthly&year=2026&month=10')

    expect(await screen.findByRole('status', { name: /preparing october 2026/i })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: /october 2026 book/i })).not.toBeInTheDocument()
    expect(mocked.ensureMonthlyBook).toHaveBeenCalledWith(2026, 10)

    release()

    const list = await screen.findByRole('list', { name: /october 2026 book/i })
    expect(within(list).getByRole('link', { name: 'October 2026' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: /preparing october 2026/i })).not.toBeInTheDocument()
  })

  it('ensures the current month by default (user timezone)', async () => {
    installFakeBackend()
    renderBooksApp('/books')
    const now = new Date()
    await waitFor(() => expect(mocked.ensureMonthlyBook).toHaveBeenCalledTimes(1))
    const [year, month] = mocked.ensureMonthlyBook.mock.calls[0]
    // timezone is UTC in the mocked user
    expect(year).toBe(now.getUTCFullYear())
    expect(month).toBe(now.getUTCMonth() + 1)
  })

  it('links the ensured book to its details page', async () => {
    const state = installFakeBackend()
    renderBooksApp('/books?tab=monthly&year=2026&month=10')
    const list = await screen.findByRole('list', { name: /october 2026 book/i })
    const link = within(list).getByRole('link', { name: 'October 2026' })
    expect(link).toHaveAttribute('href', `/books/${state.books[0].id}`)
  })

  it('does not issue duplicate ensure requests across re-renders', async () => {
    installFakeBackend()
    const { rerender } = renderBooksApp('/books?tab=monthly&year=2026&month=10')
    await screen.findByRole('list', { name: /october 2026 book/i })
    rerender(<div />)
    expect(mocked.ensureMonthlyBook).toHaveBeenCalledTimes(1)
  })

  it('shares one in-flight request for the same month', async () => {
    installFakeBackend()
    mocked.ensureMonthlyBook.mockImplementation(
      async (year, month) => ({ book: makeMonthlyBook(year, month), created: false }),
    )
    renderBooksApp('/books?tab=monthly&year=2026&month=10')
    await screen.findByRole('list', { name: /october 2026 book/i })
    expect(mocked.ensureMonthlyBook).toHaveBeenCalledTimes(1)
  })

  it('shows an error and retries the ensure request', async () => {
    installFakeBackend()
    mocked.ensureMonthlyBook
      .mockRejectedValueOnce(apiError('network_error', 'Network Error'))
      .mockImplementation(async (year, month) => ({ book: makeMonthlyBook(year, month), created: true }))

    renderBooksApp('/books?tab=monthly&year=2026&month=10')

    const alert = await screen.findByText(/offline or the server can't be reached/i)
    expect(alert).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: /october 2026 book/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByRole('list', { name: /october 2026 book/i })).toBeInTheDocument()
    expect(mocked.ensureMonthlyBook).toHaveBeenCalledTimes(2)
  })

  it('shows the API validation message when ensure is rejected', async () => {
    installFakeBackend()
    mocked.ensureMonthlyBook.mockRejectedValue(
      apiError('validation_error', 'Year must be between 2000 and 2200.'),
    )
    renderBooksApp('/books?tab=monthly&year=2026&month=10')
    expect(await screen.findByText(/year must be between 2000 and 2200/i)).toBeInTheDocument()
  })
})

describe('Monthly books — month navigation', () => {
  it('displays the selected month and year', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=monthly&year=2026&month=3')
    expect(screen.getByTestId('selected-month')).toHaveTextContent('March 2026')
    await screen.findByRole('list', { name: /march 2026 book/i })
  })

  it('navigates to the previous and next month and ensures each', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=monthly&year=2026&month=6')
    await screen.findByRole('list', { name: /june 2026 book/i })

    await userEvent.click(screen.getByRole('button', { name: /next month/i }))
    expect(await screen.findByRole('list', { name: /july 2026 book/i })).toBeInTheDocument()
    expect(mocked.ensureMonthlyBook).toHaveBeenLastCalledWith(2026, 7)

    await userEvent.click(screen.getByRole('button', { name: /previous month/i }))
    await userEvent.click(screen.getByRole('button', { name: /previous month/i }))
    expect(await screen.findByRole('list', { name: /may 2026 book/i })).toBeInTheDocument()
    expect(mocked.ensureMonthlyBook).toHaveBeenLastCalledWith(2026, 5)
  })

  it('rolls December → January into the next year', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=monthly&year=2026&month=12')
    await screen.findByRole('list', { name: /december 2026 book/i })

    await userEvent.click(screen.getByRole('button', { name: /next month/i }))

    expect(screen.getByTestId('selected-month')).toHaveTextContent('January 2027')
    expect(await screen.findByRole('list', { name: /january 2027 book/i })).toBeInTheDocument()
    expect(mocked.ensureMonthlyBook).toHaveBeenLastCalledWith(2027, 1)
    expect(screen.getByTestId('location')).toHaveTextContent('year=2027&month=1')
  })

  it('rolls January → December into the previous year', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=monthly&year=2026&month=1')
    await screen.findByRole('list', { name: /january 2026 book/i })

    await userEvent.click(screen.getByRole('button', { name: /previous month/i }))

    expect(screen.getByTestId('selected-month')).toHaveTextContent('December 2025')
    expect(await screen.findByRole('list', { name: /december 2025 book/i })).toBeInTheDocument()
    expect(mocked.ensureMonthlyBook).toHaveBeenLastCalledWith(2025, 12)
  })

  it('does not re-POST when returning to an already ensured month', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=monthly&year=2026&month=6')
    await screen.findByRole('list', { name: /june 2026 book/i })
    await userEvent.click(screen.getByRole('button', { name: /next month/i }))
    await screen.findByRole('list', { name: /july 2026 book/i })
    await userEvent.click(screen.getByRole('button', { name: /previous month/i }))
    await screen.findByRole('list', { name: /june 2026 book/i })
    expect(mocked.ensureMonthlyBook).toHaveBeenCalledTimes(2)
  })

  it('offers a way back to the current month', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=monthly&year=2020&month=2')
    await screen.findByRole('list', { name: /february 2020 book/i })
    await userEvent.click(screen.getByRole('button', { name: /current month/i }))
    const now = new Date()
    await waitFor(() =>
      expect(mocked.ensureMonthlyBook).toHaveBeenLastCalledWith(now.getUTCFullYear(), now.getUTCMonth() + 1),
    )
  })

  it('ignores invalid year/month URL params and uses the current month', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=monthly&year=abc&month=99')
    const now = new Date()
    await waitFor(() =>
      expect(mocked.ensureMonthlyBook).toHaveBeenCalledWith(now.getUTCFullYear(), now.getUTCMonth() + 1),
    )
  })

  it('disables navigation beyond the supported year range', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=monthly&year=2000&month=1')
    expect(screen.getByRole('button', { name: /previous month/i })).toBeDisabled()
    await screen.findByRole('list', { name: /january 2000 book/i })
  })
})

describe('Monthly books — list and controls', () => {
  it('lists existing monthly books newest first', async () => {
    installFakeBackend([
      makeMonthlyBook(2026, 8),
      makeMonthlyBook(2026, 10),
      makeMonthlyBook(2026, 9),
    ])
    renderBooksApp('/books?tab=monthly&year=2026&month=10')
    await screen.findByRole('list', { name: /october 2026 book/i })
    const all = await screen.findAllByRole('heading', { level: 3 })
    expect(all.map((h) => h.textContent)).toEqual([
      'October 2026', // ensured card
      'October 2026',
      'September 2026',
      'August 2026',
    ])
    expect(mocked.listBooks).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MONTHLY' }),
      expect.anything(),
    )
  })

  it('shows an empty state while no monthly books exist and the ensure is failing', async () => {
    installFakeBackend()
    mocked.ensureMonthlyBook.mockRejectedValue(apiError('server_error', 'x'))
    renderBooksApp('/books?tab=monthly&year=2026&month=10')
    expect(await screen.findByText(/no monthly books yet/i)).toBeInTheDocument()
  })

  it('shows a list error with retry', async () => {
    // existing book → ensure returns created:false, so no extra list invalidation
    installFakeBackend([makeMonthlyBook(2026, 10)])
    mocked.listBooks
      .mockRejectedValueOnce(apiError('network_error', 'Network Error'))
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
    renderBooksApp('/books?tab=monthly&year=2026&month=10')
    expect(await screen.findByText(/offline or the server can't be reached/i)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /retry/i })[0])
    expect(await screen.findByText(/no monthly books yet/i)).toBeInTheDocument()
  })

  it('never renders create, edit, archive or restore controls for monthly books', async () => {
    installFakeBackend([makeMonthlyBook(2026, 9)])
    renderBooksApp('/books?tab=monthly&year=2026&month=10')
    await screen.findByRole('list', { name: /october 2026 book/i })
    expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restore/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/show archived/i)).not.toBeInTheDocument()
  })

  it('never uses POST /books/ for monthly books', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=monthly&year=2026&month=10')
    await screen.findByRole('list', { name: /october 2026 book/i })
    expect(mocked.createBook).not.toHaveBeenCalled()
  })

  it('paginates the monthly list using the backend envelope', async () => {
    installFakeBackend()
    mocked.listBooks.mockImplementation(async (params = {}) => ({
      count: 30,
      next: params.page === 2 ? null : 'http://x/?page=2',
      previous: params.page === 2 ? 'http://x/?page=1' : null,
      results: [makeMonthlyBook(2025, params.page === 2 ? 1 : 2)],
    }))
    renderBooksApp('/books?tab=monthly&year=2026&month=10')
    await screen.findByRole('list', { name: /october 2026 book/i })
    await userEvent.click(await screen.findByRole('button', { name: /next page/i }))
    expect(await screen.findByText('January 2025')).toBeInTheDocument()
    expect(mocked.listBooks).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'MONTHLY', page: 2 }),
      expect.anything(),
    )
  })
})
