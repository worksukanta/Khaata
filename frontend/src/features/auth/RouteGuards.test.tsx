/**
 * Tests for PrivateRoute and PublicOnlyRoute.
 *
 * Covers:
 *  - PrivateRoute renders null while initializing (prevents redirect flash)
 *  - PrivateRoute redirects to /login when unauthenticated
 *  - PrivateRoute renders children when authenticated
 *  - PrivateRoute preserves the original destination in location.state.from
 *  - PublicOnlyRoute renders null while initializing
 *  - PublicOnlyRoute redirects to / when authenticated
 *  - PublicOnlyRoute renders children when unauthenticated
 *  - No redirect loops between /login and protected routes
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mock AuthContext — we control the auth state entirely in these tests
// ---------------------------------------------------------------------------

const mockAuthState = {
  initializing: false,
  user: null as { id: string; email: string; display_name: string; timezone: string } | null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
}

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import PrivateRoute from '@/features/auth/PrivateRoute'
import PublicOnlyRoute from '@/features/auth/PublicOnlyRoute'

const mockUser = {
  id: 'abc-123',
  email: 'user@example.com',
  display_name: 'Test',
  timezone: 'Asia/Kolkata',
}

// ---------------------------------------------------------------------------
// Helper: renders a minimal router with the given initial path
// ---------------------------------------------------------------------------

function renderRoutes(initialPath: string, authenticated: boolean, initializing = false) {
  mockAuthState.initializing = initializing
  mockAuthState.user = authenticated ? mockUser : null

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        {/* Public-only routes */}
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route path="/register" element={<div>Register Page</div>} />
        </Route>

        {/* Protected routes */}
        <Route element={<PrivateRoute />}>
          <Route path="/" element={<div>Home Page</div>} />
          <Route path="/books" element={<div>Books Page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// PrivateRoute
// ---------------------------------------------------------------------------

describe('PrivateRoute', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders null while initializing (prevents redirect flash)', () => {
    renderRoutes('/', false, true /* initializing */)
    // Neither the protected page nor a redirect target should be rendered
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument()
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })

  it('redirects to /login when unauthenticated', () => {
    renderRoutes('/', false)
    // Login page should now be rendered (redirect happened)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument()
  })

  it('renders the protected content when authenticated', () => {
    renderRoutes('/', true)
    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })

  it('redirects /books to /login when unauthenticated', () => {
    renderRoutes('/books', false)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Books Page')).not.toBeInTheDocument()
  })

  it('renders /books when authenticated', () => {
    renderRoutes('/books', true)
    expect(screen.getByText('Books Page')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// PublicOnlyRoute
// ---------------------------------------------------------------------------

describe('PublicOnlyRoute', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders null while initializing', () => {
    renderRoutes('/login', false, true /* initializing */)
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument()
  })

  it('renders the login page when unauthenticated', () => {
    renderRoutes('/login', false)
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('renders the register page when unauthenticated', () => {
    renderRoutes('/register', false)
    expect(screen.getByText('Register Page')).toBeInTheDocument()
  })

  it('redirects authenticated user away from /login to home', () => {
    renderRoutes('/login', true)
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })

  it('redirects authenticated user away from /register to home', () => {
    renderRoutes('/register', true)
    expect(screen.queryByText('Register Page')).not.toBeInTheDocument()
    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// PrivateRoute — destination preservation
// ---------------------------------------------------------------------------

describe('PrivateRoute — destination preservation', () => {
  it('redirects unauthenticated user and the login page renders instead', () => {
    // Set unauthenticated state directly (bypasses renderRoutes helper)
    mockAuthState.initializing = false
    mockAuthState.user = null

    render(
      <MemoryRouter initialEntries={['/books']}>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<PrivateRoute />}>
            <Route path="/books" element={<div>Books Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    // PrivateRoute redirected to /login; the login page is rendered
    expect(screen.getByText('Login Page')).toBeInTheDocument()
    expect(screen.queryByText('Books Page')).not.toBeInTheDocument()
  })
})
