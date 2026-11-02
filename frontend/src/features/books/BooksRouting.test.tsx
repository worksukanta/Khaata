/**
 * Books routing: protected-route behaviour, FE-003 shell preservation, direct
 * URL navigation to books routes, and unknown routes.
 */

import { render, screen, within } from '@testing-library/react'
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

vi.mock('@/services/api/books')
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => authState,
}))

import * as booksApi from '@/services/api/books'
import AppShell from '@/components/layout/AppShell'
import NotFoundPage from '@/components/layout/NotFoundPage'
import PrivateRoute from '@/features/auth/PrivateRoute'
import BooksPage from './BooksPage'
import BookDetailsPage from './BookDetailsPage'
import { createTestQueryClient, installFakeBackend, makeBook } from './testUtils'

const user = { id: 'u1', email: 'a@b.c', display_name: 'Alice', timezone: 'UTC' }

function renderApp(path: string) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/" element={<PrivateRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<div>Home Page</div>} />
              <Route path="books" element={<BooksPage />} />
              <Route path="books/:id" element={<BookDetailsPage />} />
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
})

describe('Books routing', () => {
  it('redirects unauthenticated users from /books to /login without calling the API', () => {
    authState.user = null
    installFakeBackend()
    renderApp('/books')
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(vi.mocked(booksApi).listBooks).not.toHaveBeenCalled()
  })

  it('redirects unauthenticated users from a book detail URL to /login', () => {
    authState.user = null
    installFakeBackend()
    renderApp('/books/00000000-0000-4000-8000-000000000001')
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('renders /books directly inside the FE-003 shell with a single banner and navigation', async () => {
    installFakeBackend()
    renderApp('/books?tab=general')
    expect(await screen.findByRole('heading', { level: 1, name: 'My Books' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getAllByRole('banner')).toHaveLength(1)
    expect(screen.getAllByRole('complementary')).toHaveLength(1) // single sidebar
    expect(screen.getByRole('navigation', { name: /book types/i })).toBeInTheDocument()
  })

  it('opens a book detail URL directly (refresh-safe)', async () => {
    const book = makeBook({ type: 'GENERAL', name: 'Direct' })
    installFakeBackend([book])
    renderApp(`/books/${book.id}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Direct' })).toBeInTheDocument()
  })

  it('navigates from the list to a detail page and back', async () => {
    const book = makeBook({ type: 'GENERAL', name: 'Misc' })
    installFakeBackend([book])
    renderApp('/books?tab=general')
    await userEvent.click(await screen.findByRole('link', { name: 'Misc' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Misc' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: /back to books/i }))
    expect(await screen.findByRole('heading', { level: 1, name: 'My Books' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Misc' })).toBeInTheDocument()
  })

  it('renders the 404 page for an unknown route', () => {
    renderApp('/books/a/b/c')
    expect(screen.getByRole('heading', { name: /404/i })).toBeInTheDocument()
  })

  it('shows a Books nav item in the shell that is current on /books', async () => {
    installFakeBackend()
    renderApp('/books')
    const sidebar = screen.getByRole('complementary')
    expect(within(sidebar).getByRole('link', { name: /books/i })).toHaveAttribute('aria-current', 'page')
    await screen.findByRole('heading', { level: 1, name: 'My Books' })
  })
})

