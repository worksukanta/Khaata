/**
 * Event and General books: listing, empty/search states, create, edit,
 * archive (with confirmation), restore, archived visibility, validation
 * and backend field errors, loading/duplicate-submit behaviour, and cache
 * invalidation after mutations.
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
import { apiError, installFakeBackend, makeBook, renderBooksApp } from './testUtils'

const mocked = vi.mocked(booksApi)

beforeEach(() => {
  vi.resetAllMocks()
})

describe.each([
  { tab: 'event', type: 'EVENT' as const, label: 'event' },
  { tab: 'general', type: 'GENERAL' as const, label: 'general' },
])('$label books — listing', ({ tab, type, label }) => {
  it('lists books of that type only, active by default', async () => {
    installFakeBackend([
      makeBook({ type, name: 'Alpha' }),
      makeBook({ type, name: 'Hidden archived', is_archived: true }),
      makeBook({ type: type === 'EVENT' ? 'GENERAL' : 'EVENT', name: 'Other type' }),
    ])
    renderBooksApp(`/books?tab=${tab}`)
    expect(await screen.findByText('Alpha')).toBeInTheDocument()
    expect(screen.queryByText('Hidden archived')).not.toBeInTheDocument()
    expect(screen.queryByText('Other type')).not.toBeInTheDocument()
    expect(mocked.listBooks).toHaveBeenCalledWith(
      expect.objectContaining({ type, is_archived: false, ordering: '-created_at', page: 1 }),
      expect.anything(),
    )
  })

  it('shows a loading state first', async () => {
    installFakeBackend()
    mocked.listBooks.mockImplementation(() => new Promise(() => {}))
    renderBooksApp(`/books?tab=${tab}`)
    expect(await screen.findByRole('status', { name: new RegExp(`loading ${label} books`, 'i') })).toBeInTheDocument()
  })

  it('shows an empty state with a create call to action', async () => {
    installFakeBackend()
    renderBooksApp(`/books?tab=${tab}`)
    expect(await screen.findByText(new RegExp(`no ${label} books yet`, 'i'))).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: new RegExp(`create ${label} book`, 'i') }).length).toBe(2)
  })

  it('shows a retryable error when loading fails', async () => {
    installFakeBackend()
    mocked.listBooks
      .mockRejectedValueOnce(apiError('network_error', 'Network Error'))
      .mockResolvedValue({ count: 0, next: null, previous: null, results: [] })
    renderBooksApp(`/books?tab=${tab}`)
    expect(await screen.findByText(/offline or the server can't be reached/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(await screen.findByText(new RegExp(`no ${label} books yet`, 'i'))).toBeInTheDocument()
  })

  it('searches by name via the API search parameter and shows a no-results state', async () => {
    installFakeBackend([makeBook({ type, name: 'Goa Trip' }), makeBook({ type, name: 'Office' })])
    renderBooksApp(`/books?tab=${tab}`)
    await screen.findByText('Goa Trip')

    await userEvent.type(screen.getByLabelText(new RegExp(`search ${label} books`, 'i')), 'goa')
    await waitFor(() =>
      expect(mocked.listBooks).toHaveBeenLastCalledWith(
        expect.objectContaining({ type, search: 'goa' }),
        expect.anything(),
      ),
    )
    await waitFor(() => expect(screen.queryByText('Office')).not.toBeInTheDocument())
    expect(screen.getByText('Goa Trip')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText(new RegExp(`search ${label} books`, 'i')))
    await userEvent.type(screen.getByLabelText(new RegExp(`search ${label} books`, 'i')), 'zzz')
    expect(await screen.findByText(/no books match your search/i)).toBeInTheDocument()
  })

  it('restores the search term from the URL', async () => {
    installFakeBackend([makeBook({ type, name: 'Goa Trip' }), makeBook({ type, name: 'Office' })])
    renderBooksApp(`/books?tab=${tab}&q=office`)
    expect(await screen.findByText('Office')).toBeInTheDocument()
    expect(screen.queryByText('Goa Trip')).not.toBeInTheDocument()
    expect(screen.getByLabelText(new RegExp(`search ${label} books`, 'i'))).toHaveValue('office')
  })

  it('shows archived books via the archived filter, with Restore only', async () => {
    installFakeBackend([
      makeBook({ type, name: 'Active one' }),
      makeBook({ type, name: 'Old one', is_archived: true }),
    ])
    renderBooksApp(`/books?tab=${tab}`)
    await screen.findByText('Active one')

    await userEvent.click(screen.getByLabelText(/show archived/i))

    expect(await screen.findByText('Old one')).toBeInTheDocument()
    expect(screen.queryByText('Active one')).not.toBeInTheDocument()
    expect(mocked.listBooks).toHaveBeenLastCalledWith(
      expect.objectContaining({ type, is_archived: true }),
      expect.anything(),
    )
    expect(screen.getByRole('button', { name: /restore old one/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /edit old one/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /archive old one/i })).not.toBeInTheDocument()
  })

  it('shows an empty archived state', async () => {
    installFakeBackend()
    renderBooksApp(`/books?tab=${tab}&archived=1`)
    expect(await screen.findByText(new RegExp(`no archived ${label} books`, 'i'))).toBeInTheDocument()
  })

  it('shows Edit and Archive for active books', async () => {
    installFakeBackend([makeBook({ type, name: 'Alpha' })])
    renderBooksApp(`/books?tab=${tab}`)
    await screen.findByText('Alpha')
    expect(screen.getByRole('button', { name: /edit alpha/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /archive alpha/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /restore alpha/i })).not.toBeInTheDocument()
  })
})

describe('event books — create', () => {
  it('creates an event book with dates, closes the dialog and shows the new book', async () => {
    const state = installFakeBackend()
    renderBooksApp('/books?tab=event')
    await screen.findByText(/no event books yet/i)

    await userEvent.click(screen.getAllByRole('button', { name: /create event book/i })[0])
    const dialog = await screen.findByRole('dialog', { name: /create event book/i })

    await userEvent.type(within(dialog).getByLabelText(/^name/i), '  Durga Puja 2026  ')
    await userEvent.type(within(dialog).getByLabelText(/description/i), 'Committee')
    await userEvent.type(within(dialog).getByLabelText(/start date/i), '2026-10-16')
    await userEvent.type(within(dialog).getByLabelText(/end date/i), '2026-10-21')
    await userEvent.click(within(dialog).getByRole('button', { name: /^create event book$/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mocked.createBook).toHaveBeenCalledWith({
      type: 'EVENT',
      name: 'Durga Puja 2026',
      description: 'Committee',
      start_date: '2026-10-16',
      end_date: '2026-10-21',
    })
    expect(state.books).toHaveLength(1)
    // list invalidated → refetched → user sees the new book
    expect(await screen.findByRole('link', { name: 'Durga Puja 2026' })).toBeInTheDocument()
    expect(screen.getByText('16 Oct 2026 – 21 Oct 2026')).toBeInTheDocument()
    expect(await screen.findByText('Book created.')).toBeInTheDocument()
  })

  it('refetches the list after create (query invalidation)', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=event')
    await screen.findByText(/no event books yet/i)
    const before = mocked.listBooks.mock.calls.length

    await userEvent.click(screen.getAllByRole('button', { name: /create event book/i })[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'X')
    await userEvent.click(within(dialog).getByRole('button', { name: /^create event book$/i }))

    await waitFor(() => expect(mocked.listBooks.mock.calls.length).toBeGreaterThan(before))
  })

  it('blocks submit for a missing name and keeps the dialog open', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=event')
    await userEvent.click((await screen.findAllByRole('button', { name: /create event book/i }))[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /^create event book$/i }))
    expect(within(dialog).getByText('Name is required.')).toBeInTheDocument()
    expect(mocked.createBook).not.toHaveBeenCalled()
  })

  it('rejects a whitespace-only name', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=event')
    await userEvent.click((await screen.findAllByRole('button', { name: /create event book/i }))[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^name/i), '    ')
    await userEvent.click(within(dialog).getByRole('button', { name: /^create event book$/i }))
    expect(within(dialog).getByText('Name is required.')).toBeInTheDocument()
    expect(mocked.createBook).not.toHaveBeenCalled()
  })

  it('rejects an end date before the start date', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=event')
    await userEvent.click((await screen.findAllByRole('button', { name: /create event book/i }))[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'Trip')
    await userEvent.type(within(dialog).getByLabelText(/start date/i), '2026-10-21')
    await userEvent.type(within(dialog).getByLabelText(/end date/i), '2026-10-16')
    await userEvent.click(within(dialog).getByRole('button', { name: /^create event book$/i }))
    expect(within(dialog).getByText('End date cannot be earlier than start date.')).toBeInTheDocument()
    expect(mocked.createBook).not.toHaveBeenCalled()
  })

  it('displays backend field errors, preserves input and keeps the dialog open', async () => {
    installFakeBackend()
    mocked.createBook.mockRejectedValue(
      apiError('validation_error', 'The request contains invalid fields.', {
        name: ['Server says no.'],
        end_date: ['Server end date error.'],
      }),
    )
    renderBooksApp('/books?tab=event')
    await userEvent.click((await screen.findAllByRole('button', { name: /create event book/i }))[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'My trip')
    await userEvent.click(within(dialog).getByRole('button', { name: /^create event book$/i }))

    expect(await within(dialog).findByText('Server says no.')).toBeInTheDocument()
    expect(within(dialog).getByText('Server end date error.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^name/i)).toHaveValue('My trip')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // can resubmit after the failure
    expect(within(dialog).getByRole('button', { name: /^create event book$/i })).toBeEnabled()
  })

  it('shows a network error without closing the dialog or losing input', async () => {
    installFakeBackend()
    mocked.createBook.mockRejectedValue(apiError('network_error', 'Network Error'))
    renderBooksApp('/books?tab=event')
    await userEvent.click((await screen.findAllByRole('button', { name: /create event book/i }))[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'Keep me')
    await userEvent.click(within(dialog).getByRole('button', { name: /^create event book$/i }))
    expect(await within(dialog).findByText(/offline or the server can't be reached/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^name/i)).toHaveValue('Keep me')
  })

  it('disables the form and prevents duplicate submissions while saving', async () => {
    installFakeBackend()
    let resolveCreate!: () => void
    mocked.createBook.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = () => resolve(makeBook({ type: 'EVENT', name: 'Slow' }))
        }),
    )
    renderBooksApp('/books?tab=event')
    await userEvent.click((await screen.findAllByRole('button', { name: /create event book/i }))[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'Slow')

    const submit = within(dialog).getByRole('button', { name: /^create event book$/i })
    await userEvent.click(submit)

    const saving = await within(dialog).findByRole('button', { name: /saving/i })
    expect(saving).toBeDisabled()
    expect(saving).toHaveAttribute('aria-busy', 'true')
    expect(within(dialog).getByLabelText(/^name/i)).toBeDisabled()
    await userEvent.click(saving)
    await userEvent.keyboard('{Enter}')
    expect(mocked.createBook).toHaveBeenCalledTimes(1)

    // Escape does not close the dialog mid-request
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    resolveCreate()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mocked.createBook).toHaveBeenCalledTimes(1)
  })

  it('closes on Cancel without calling the API', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=event')
    await userEvent.click((await screen.findAllByRole('button', { name: /create event book/i }))[0])
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocked.createBook).not.toHaveBeenCalled()
  })
})

describe('general books — create', () => {
  it('creates a general book without date fields', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=general')
    await userEvent.click((await screen.findAllByRole('button', { name: /create general book/i }))[0])
    const dialog = await screen.findByRole('dialog', { name: /create general book/i })
    expect(within(dialog).queryByLabelText(/start date/i)).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/end date/i)).not.toBeInTheDocument()

    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'Household Miscellaneous')
    await userEvent.click(within(dialog).getByRole('button', { name: /^create general book$/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mocked.createBook).toHaveBeenCalledWith({ type: 'GENERAL', name: 'Household Miscellaneous' })
    expect(await screen.findByRole('link', { name: 'Household Miscellaneous' })).toBeInTheDocument()
  })

  it('validates the name', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=general')
    await userEvent.click((await screen.findAllByRole('button', { name: /create general book/i }))[0])
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^name/i), '   ')
    await userEvent.click(within(dialog).getByRole('button', { name: /^create general book$/i }))
    expect(within(dialog).getByText('Name is required.')).toBeInTheDocument()
    expect(mocked.createBook).not.toHaveBeenCalled()
  })
})

describe('editing', () => {
  it('edits an event book, prefilled, and shows the updated data', async () => {
    installFakeBackend([
      makeBook({ type: 'EVENT', name: 'Old name', description: 'Old', start_date: '2026-10-16', end_date: '2026-10-21' }),
    ])
    renderBooksApp('/books?tab=event')
    await userEvent.click(await screen.findByRole('button', { name: /edit old name/i }))
    const dialog = await screen.findByRole('dialog', { name: /edit event book/i })
    expect(within(dialog).getByLabelText(/^name/i)).toHaveValue('Old name')
    expect(within(dialog).getByLabelText(/start date/i)).toHaveValue('2026-10-16')

    await userEvent.clear(within(dialog).getByLabelText(/^name/i))
    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'New name')
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mocked.updateBook).toHaveBeenCalledWith(
      expect.any(String),
      { name: 'New name', description: 'Old', start_date: '2026-10-16', end_date: '2026-10-21' },
    )
    expect(await screen.findByRole('link', { name: 'New name' })).toBeInTheDocument()
    expect(screen.queryByText('Old name')).not.toBeInTheDocument()
    expect(await screen.findByText('Book updated.')).toBeInTheDocument()
  })

  it('edits a general book and sends no date fields', async () => {
    installFakeBackend([makeBook({ type: 'GENERAL', name: 'Misc' })])
    renderBooksApp('/books?tab=general')
    await userEvent.click(await screen.findByRole('button', { name: /edit misc/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.type(within(dialog).getByLabelText(/^name/i), ' 2')
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(mocked.updateBook).toHaveBeenCalledWith(expect.any(String), { name: 'Misc 2', description: '' }))
  })

  it('shows backend validation errors on edit and keeps the dialog open', async () => {
    installFakeBackend([makeBook({ type: 'EVENT', name: 'Trip' })])
    mocked.updateBook.mockRejectedValue(
      apiError('validation_error', 'invalid', { detail: ['Archived books cannot be edited.'] }),
    )
    renderBooksApp('/books?tab=event')
    await userEvent.click(await screen.findByRole('button', { name: /edit trip/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }))
    expect(await within(dialog).findByText('Archived books cannot be edited.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^name/i)).toHaveValue('Trip')
  })

  it('validates edits client-side (whitespace name, date order)', async () => {
    installFakeBackend([makeBook({ type: 'EVENT', name: 'Trip' })])
    renderBooksApp('/books?tab=event')
    await userEvent.click(await screen.findByRole('button', { name: /edit trip/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.clear(within(dialog).getByLabelText(/^name/i))
    await userEvent.type(within(dialog).getByLabelText(/^name/i), '  ')
    await userEvent.type(within(dialog).getByLabelText(/start date/i), '2026-10-21')
    await userEvent.type(within(dialog).getByLabelText(/end date/i), '2026-10-01')
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }))
    expect(within(dialog).getByText('Name is required.')).toBeInTheDocument()
    expect(within(dialog).getByText('End date cannot be earlier than start date.')).toBeInTheDocument()
    expect(mocked.updateBook).not.toHaveBeenCalled()
  })
})

describe('archive and restore', () => {
  it('requires confirmation before archiving and does not call the API on cancel', async () => {
    installFakeBackend([makeBook({ type: 'EVENT', name: 'Trip' })])
    renderBooksApp('/books?tab=event')
    await userEvent.click(await screen.findByRole('button', { name: /archive trip/i }))
    const dialog = await screen.findByRole('dialog', { name: /archive this book/i })
    expect(mocked.archiveBook).not.toHaveBeenCalled()
    expect(within(dialog).getByText(/not deleted/i)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocked.archiveBook).not.toHaveBeenCalled()
    expect(screen.getByText('Trip')).toBeInTheDocument()
  })

  it('archives after confirmation, removes it from the active view and shows it as archived', async () => {
    installFakeBackend([makeBook({ type: 'EVENT', name: 'Trip' }), makeBook({ type: 'EVENT', name: 'Keep' })])
    renderBooksApp('/books?tab=event')
    const card = await screen.findByRole('button', { name: /archive trip/i })
    await userEvent.click(card)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /^archive book$/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mocked.archiveBook).toHaveBeenCalledWith(expect.any(String))
    expect(await screen.findByText('“Trip” archived.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Trip' })).not.toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Keep' })).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText(/show archived/i))
    expect(await screen.findByRole('link', { name: 'Trip' })).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
  })

  it('does not report success when archiving fails, and keeps the dialog open with the error', async () => {
    installFakeBackend([makeBook({ type: 'GENERAL', name: 'Misc' })])
    mocked.archiveBook.mockRejectedValue(apiError('network_error', 'Network Error'))
    renderBooksApp('/books?tab=general')
    await userEvent.click(await screen.findByRole('button', { name: /archive misc/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /^archive book$/i }))

    expect(await within(dialog).findByText(/offline or the server can't be reached/i)).toBeInTheDocument()
    expect(screen.queryByText('“Misc” archived.')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Misc' })).toBeInTheDocument()
  })

  it('shows the server message when the server rejects the archive', async () => {
    installFakeBackend([makeBook({ type: 'GENERAL', name: 'Misc' })])
    mocked.archiveBook.mockRejectedValue(
      apiError('validation_error', 'The request contains invalid fields.'),
    )
    renderBooksApp('/books?tab=general')
    await userEvent.click(await screen.findByRole('button', { name: /archive misc/i }))
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^archive book$/i }))
    expect(await screen.findByText('The request contains invalid fields.')).toBeInTheDocument()
  })

  it('prevents duplicate archive requests while pending', async () => {
    installFakeBackend([makeBook({ type: 'EVENT', name: 'Trip' })])
    let release!: () => void
    mocked.archiveBook.mockImplementation(
      () => new Promise((resolve) => { release = () => resolve(makeBook({ is_archived: true })) }),
    )
    renderBooksApp('/books?tab=event')
    await userEvent.click(await screen.findByRole('button', { name: /archive trip/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /^archive book$/i }))
    const busy = await within(dialog).findByRole('button', { name: /archiving/i })
    expect(busy).toBeDisabled()
    await userEvent.click(busy)
    expect(mocked.archiveBook).toHaveBeenCalledTimes(1)
    release()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('restores an archived book, refreshes the list and gives feedback', async () => {
    installFakeBackend([makeBook({ type: 'EVENT', name: 'Old trip', is_archived: true })])
    renderBooksApp('/books?tab=event&archived=1')
    await userEvent.click(await screen.findByRole('button', { name: /restore old trip/i }))

    expect(mocked.restoreBook).toHaveBeenCalledWith(expect.any(String))
    expect(await screen.findByText('“Old trip” restored.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Old trip' })).not.toBeInTheDocument())
    expect(await screen.findByText(/no archived event books/i)).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText(/show archived/i))
    expect(await screen.findByRole('link', { name: 'Old trip' })).toBeInTheDocument()
  })

  it('shows an error toast and keeps the book archived when restore fails', async () => {
    installFakeBackend([makeBook({ type: 'GENERAL', name: 'Old', is_archived: true })])
    mocked.restoreBook.mockRejectedValue(apiError('network_error', 'Network Error'))
    renderBooksApp('/books?tab=general&archived=1')
    await userEvent.click(await screen.findByRole('button', { name: /restore old/i }))
    expect(await screen.findByText(/offline or the server can't be reached/i)).toBeInTheDocument()
    expect(screen.queryByText(/restored\.$/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Old' })).toBeInTheDocument()
  })
})

describe('type distinction on the overview', () => {
  it('explains each book type and links to each tab', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=event')
    const nav = screen.getByRole('navigation', { name: /book types/i })
    expect(within(nav).getByRole('link', { name: 'Monthly' })).toHaveAttribute('href', '/books?tab=monthly')
    expect(within(nav).getByRole('link', { name: 'Event' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'General' })).toHaveAttribute('href', '/books?tab=general')
    expect(screen.getByText(/specific occasion or trip/i)).toBeInTheDocument()
    await screen.findByText(/no event books yet/i)

    await userEvent.click(within(nav).getByRole('link', { name: 'General' }))
    expect(await screen.findByText(/no general books yet/i)).toBeInTheDocument()
    expect(screen.getByText(/open-ended books/i)).toBeInTheDocument()
  })

  it('treats an unknown tab as the monthly tab', async () => {
    installFakeBackend()
    renderBooksApp('/books?tab=bogus')
    expect(await screen.findByRole('heading', { name: /selected month/i })).toBeInTheDocument()
  })
})
