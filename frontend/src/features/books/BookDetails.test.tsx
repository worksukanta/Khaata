/**
 * BookDetailsPage (`/books/:id`): metadata display, edit/archive/restore for
 * managed books, read-only archived banner, invalid/unknown ids, errors, and
 * cache freshness after updates.
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
import { apiError, installFakeBackend, makeBook, makeMonthlyBook, renderBooksApp } from './testUtils'

const mocked = vi.mocked(booksApi)

beforeEach(() => {
  vi.resetAllMocks()
})

describe('BookDetailsPage', () => {
  it('shows an event book with dates, description and opening balance', async () => {
    const book = makeBook({
      type: 'EVENT',
      name: 'Durga Puja 2026',
      description: 'Puja committee expenses',
      start_date: '2026-10-16',
      end_date: '2026-10-21',
      opening_balance: '1500.00',
    })
    installFakeBackend([book])
    renderBooksApp(`/books/${book.id}`)

    expect(await screen.findByRole('heading', { level: 1, name: 'Durga Puja 2026' })).toBeInTheDocument()
    expect(screen.getByText('Event book')).toBeInTheDocument()
    expect(screen.getByText('16 Oct 2026')).toBeInTheDocument()
    expect(screen.getByText('21 Oct 2026')).toBeInTheDocument()
    expect(screen.getByText('Puja committee expenses')).toBeInTheDocument()
    expect(screen.getByText('₹1,500.00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to books/i })).toHaveAttribute('href', '/books?tab=event')
    expect(mocked.getBook).toHaveBeenCalledWith(book.id, expect.anything())
  })

  it('shows a monthly book without any edit, archive or restore controls', async () => {
    const book = makeMonthlyBook(2026, 10)
    installFakeBackend([book])
    renderBooksApp(`/books/${book.id}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'October 2026' })).toBeInTheDocument()
    expect(screen.getByText('Monthly book')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /archive/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restore/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/start date/i)).not.toBeInTheDocument()
  })

  it('shows the archived read-only banner with Restore and no edit/archive actions', async () => {
    const book = makeBook({ type: 'GENERAL', name: 'Old', is_archived: true })
    installFakeBackend([book])
    renderBooksApp(`/books/${book.id}`)
    expect(await screen.findByText('Archived book — read only')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /restore book/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit book/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^archive book$/i })).not.toBeInTheDocument()
  })

  it('restores from the banner and then offers edit/archive', async () => {
    const book = makeBook({ type: 'GENERAL', name: 'Old', is_archived: true })
    installFakeBackend([book])
    renderBooksApp(`/books/${book.id}`)
    await userEvent.click(await screen.findByRole('button', { name: /restore book/i }))
    expect(await screen.findByRole('button', { name: /edit book/i })).toBeInTheDocument()
    expect(screen.queryByText('Archived book — read only')).not.toBeInTheDocument()
    expect(await screen.findByText('“Old” restored.')).toBeInTheDocument()
  })

  it('archives from the details page with confirmation and shows the updated state (no stale detail)', async () => {
    const book = makeBook({ type: 'EVENT', name: 'Trip' })
    installFakeBackend([book])
    renderBooksApp(`/books/${book.id}`)
    await userEvent.click(await screen.findByRole('button', { name: /^archive book$/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /^archive book$/i }))
    expect(await screen.findByText('Archived book — read only')).toBeInTheDocument()
    expect(mocked.archiveBook).toHaveBeenCalledWith(book.id)
  })

  it('edits from the details page and shows the new name immediately', async () => {
    const book = makeBook({ type: 'GENERAL', name: 'Before' })
    installFakeBackend([book])
    renderBooksApp(`/books/${book.id}`)
    await userEvent.click(await screen.findByRole('button', { name: /edit book/i }))
    const dialog = await screen.findByRole('dialog', { name: /edit general book/i })
    await userEvent.clear(within(dialog).getByLabelText(/^name/i))
    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'After')
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByRole('heading', { level: 1, name: 'After' })).toBeInTheDocument()
  })

  it('shows a generic not-found state for an unknown or inaccessible book', async () => {
    installFakeBackend()
    renderBooksApp('/books/00000000-0000-4000-8000-0000000000ff')
    expect(await screen.findByRole('heading', { name: /book not found/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /back to books/i })).toHaveAttribute('href', '/books')
  })

  it('treats a malformed id as not found without calling the API', async () => {
    installFakeBackend()
    renderBooksApp('/books/not-a-uuid')
    expect(await screen.findByRole('heading', { name: /book not found/i })).toBeInTheDocument()
    expect(mocked.getBook).not.toHaveBeenCalled()
  })

  it('shows a retryable error for non-404 failures', async () => {
    const book = makeBook({ type: 'EVENT', name: 'Trip' })
    installFakeBackend([book])
    mocked.getBook
      .mockRejectedValueOnce(apiError('network_error', 'Network Error'))
      .mockResolvedValue(book)
    renderBooksApp(`/books/${book.id}`)
    expect(await screen.findByText(/offline or the server can't be reached/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Trip' })).toBeInTheDocument()
  })

  it('shows a loading state while fetching', async () => {
    installFakeBackend()
    mocked.getBook.mockImplementation(() => new Promise(() => {}))
    renderBooksApp('/books/00000000-0000-4000-8000-000000000001')
    expect(await screen.findByRole('status', { name: /loading book/i })).toBeInTheDocument()
  })
})
