/**
 * Tests for LoginPage.
 *
 * Covers:
 *  - Renders the login form with email, password, submit, and register link
 *  - Client-side validation: empty email, invalid email, empty password
 *  - Loading / disabled state during submission
 *  - Successful login calls login() and navigates to home
 *  - Successful login with preserved destination (from state) navigates there
 *  - API credential error is displayed as a banner
 *  - Network error is displayed as a banner
 *  - Form fields are accessible (labels, aria-invalid, aria-describedby)
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mock AuthContext
// ---------------------------------------------------------------------------

const mockLogin = vi.fn()

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    initializing: false,
    user: null,
    login: mockLogin,
    register: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import LoginPage from '@/features/auth/LoginPage'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderLogin(initialPath = '/login', state?: unknown) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[{ pathname: initialPath, state }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home Page</div>} />
        <Route path="/books" element={<div>Books Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('LoginPage — rendering', () => {
  it('renders email and password inputs with labels', () => {
    renderLogin()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('renders a submit button', () => {
    renderLogin()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  it('renders a link to the registration page', () => {
    renderLogin()
    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute('href', '/register')
  })
})

// ---------------------------------------------------------------------------
// Client-side validation
// ---------------------------------------------------------------------------

describe('LoginPage — client-side validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows error when email is empty', async () => {
    const { user } = renderLogin()
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByText(/email is required/i)).toBeInTheDocument()
  })

  it('shows error for invalid email format', async () => {
    const { user } = renderLogin()
    await user.type(screen.getByLabelText(/email address/i), 'notanemail')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument()
  })

  it('shows error when password is empty', async () => {
    const { user } = renderLogin()
    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByText(/password is required/i)).toBeInTheDocument()
  })

  it('does not call login() when validation fails', async () => {
    const { user } = renderLogin()
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(mockLogin).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Successful login
// ---------------------------------------------------------------------------

describe('LoginPage — successful login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls login() with the entered credentials', async () => {
    mockLogin.mockResolvedValue(undefined)
    const { user } = renderLogin()

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(mockLogin).toHaveBeenCalledWith('user@example.com', 'password123'))
  })

  it('navigates to / after successful login (default destination)', async () => {
    mockLogin.mockResolvedValue(undefined)
    const { user } = renderLogin()

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(screen.getByText('Home Page')).toBeInTheDocument())
  })

  it('navigates to the preserved destination after login', async () => {
    mockLogin.mockResolvedValue(undefined)
    // Simulate arriving at /login from /books
    const { user } = renderLogin('/login', { from: { pathname: '/books' } })

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(screen.getByText('Books Page')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Login failure
// ---------------------------------------------------------------------------

describe('LoginPage — login failure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows API error message on credential failure', async () => {
    mockLogin.mockRejectedValue({
      error: { code: 'authentication_failed', message: 'Invalid email or password.' },
    })
    const { user } = renderLogin()

    await user.type(screen.getByLabelText(/email address/i), 'bad@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrongpass')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/invalid email or password/i),
    )
  })

  it('shows a generic error on network failure', async () => {
    mockLogin.mockRejectedValue({
      error: { code: 'network_error', message: 'Network error.' },
    })
    const { user } = renderLogin()

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/network error/i),
    )
  })
})

// ---------------------------------------------------------------------------
// Loading / disabled state
// ---------------------------------------------------------------------------

describe('LoginPage — loading state', () => {
  it('disables the submit button while submitting', async () => {
    // login() never resolves during this test so we can check the disabled state
    mockLogin.mockImplementation(() => new Promise(() => {}))
    const { user } = renderLogin()

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // Button should now show loading text and be disabled
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()
  })

  it('disables inputs while submitting', async () => {
    mockLogin.mockImplementation(() => new Promise(() => {}))
    const { user } = renderLogin()

    await user.type(screen.getByLabelText(/email address/i), 'user@example.com')
    await user.type(screen.getByLabelText(/password/i), 'password123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByLabelText(/email address/i)).toBeDisabled()
    expect(screen.getByLabelText(/password/i)).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('LoginPage — accessibility', () => {
  it('email input is aria-required', () => {
    renderLogin()
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('aria-required', 'true')
  })

  it('password input is aria-required', () => {
    renderLogin()
    expect(screen.getByLabelText(/password/i)).toHaveAttribute('aria-required', 'true')
  })

  it('marks email field aria-invalid after validation failure', async () => {
    const { user } = renderLogin()
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('aria-invalid', 'true')
  })
})
