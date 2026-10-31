/**
 * Tests for RegisterPage.
 *
 * Covers:
 *  - Renders all form fields with accessible labels
 *  - Client-side validation: empty email, invalid email, empty password,
 *    too-short password, mismatched confirm-password
 *  - Loading / disabled state during submission
 *  - Successful registration: shows success view, does NOT log the user in,
 *    provides a link to /login
 *  - API validation error displayed per-field (duplicate email)
 *  - Generic API error displayed as banner
 *  - Accessibility (aria-required, aria-invalid)
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mock AuthContext
// ---------------------------------------------------------------------------

const mockRegister = vi.fn()

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    initializing: false,
    user: null,
    login: vi.fn(),
    register: mockRegister,
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import RegisterPage from '@/features/auth/RegisterPage'

const VALID_EMAIL = 'new@example.com'
const VALID_PASSWORD = 'password1234' // ≥ 10 chars

const mockUser = {
  id: 'new-user-id',
  email: VALID_EMAIL,
  display_name: 'New User',
  timezone: 'Asia/Kolkata',
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderRegister() {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<div>Login Page</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return { user }
}

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  {
    email = VALID_EMAIL,
    password = VALID_PASSWORD,
    confirmPassword = VALID_PASSWORD,
    displayName = '',
  } = {},
) {
  if (displayName) {
    await user.type(screen.getByLabelText(/display name/i), displayName)
  }
  await user.type(screen.getByLabelText(/email address/i), email)
  await user.type(screen.getByLabelText(/^password$/i), password)
  await user.type(screen.getByLabelText(/confirm password/i), confirmPassword)
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

describe('RegisterPage — rendering', () => {
  it('renders display name, email, password, confirm-password fields', () => {
    renderRegister()
    expect(screen.getByLabelText(/display name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument()
  })

  it('renders a submit button', () => {
    renderRegister()
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument()
  })

  it('renders a link to the login page', () => {
    renderRegister()
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })
})

// ---------------------------------------------------------------------------
// Client-side validation
// ---------------------------------------------------------------------------

describe('RegisterPage — client-side validation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows error when email is empty', async () => {
    const { user } = renderRegister()
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(screen.getByText(/email is required/i)).toBeInTheDocument()
  })

  it('shows error for invalid email format', async () => {
    const { user } = renderRegister()
    await user.type(screen.getByLabelText(/email address/i), 'notanemail')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument()
  })

  it('shows error when password is empty', async () => {
    const { user } = renderRegister()
    await user.type(screen.getByLabelText(/email address/i), VALID_EMAIL)
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(screen.getByText(/password is required/i)).toBeInTheDocument()
  })

  it('shows error when password is less than 10 characters', async () => {
    const { user } = renderRegister()
    await user.type(screen.getByLabelText(/email address/i), VALID_EMAIL)
    await user.type(screen.getByLabelText(/^password$/i), 'short')
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(screen.getByText(/at least 10 characters/i)).toBeInTheDocument()
  })

  it('shows error when passwords do not match', async () => {
    const { user } = renderRegister()
    await fillForm(user, { confirmPassword: 'differentpassword' })
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
  })

  it('does not call register() when validation fails', async () => {
    const { user } = renderRegister()
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(mockRegister).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Successful registration
// ---------------------------------------------------------------------------

describe('RegisterPage — successful registration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows success view after registration', async () => {
    mockRegister.mockResolvedValue(mockUser)
    const { user } = renderRegister()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /account created/i })).toBeInTheDocument(),
    )
  })

  it('does NOT log the user in after successful registration', async () => {
    mockRegister.mockResolvedValue(mockUser)
    const { user } = renderRegister()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /account created/i })).toBeInTheDocument(),
    )

    // Still on success view — NOT navigated to authenticated area
    expect(screen.queryByText('Login Page')).not.toBeInTheDocument()
  })

  it('success view has a "go to sign in" link to /login', async () => {
    mockRegister.mockResolvedValue(mockUser)
    const { user } = renderRegister()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /go to sign in/i })).toBeInTheDocument(),
    )
  })

  it('clicking "go to sign in" navigates to /login', async () => {
    mockRegister.mockResolvedValue(mockUser)
    const { user } = renderRegister()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /go to sign in/i })).toBeInTheDocument(),
    )
    await user.click(screen.getByRole('link', { name: /go to sign in/i }))
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })

  it('calls register() with correct parameters', async () => {
    mockRegister.mockResolvedValue(mockUser)
    const { user } = renderRegister()

    await fillForm(user, { email: VALID_EMAIL, password: VALID_PASSWORD, displayName: 'My Name' })
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(VALID_EMAIL, VALID_PASSWORD, 'My Name')
    })
  })
})

// ---------------------------------------------------------------------------
// Registration failure
// ---------------------------------------------------------------------------

describe('RegisterPage — registration failure', () => {
  beforeEach(() => vi.clearAllMocks())

  it('displays per-field error for duplicate email', async () => {
    mockRegister.mockRejectedValue({
      error: {
        code: 'validation_error',
        message: 'The request contains invalid fields.',
        details: { email: ['A user with this email already exists.'] },
      },
    })
    const { user } = renderRegister()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(
        screen.getByText(/a user with this email already exists/i),
      ).toBeInTheDocument(),
    )
  })

  it('displays generic error banner when no details provided', async () => {
    mockRegister.mockRejectedValue({
      error: { code: 'server_error', message: 'Internal server error.' },
    })
    const { user } = renderRegister()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/internal server error/i),
    )
  })
})

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('RegisterPage — loading state', () => {
  it('disables the submit button while submitting', async () => {
    mockRegister.mockImplementation(() => new Promise(() => {}))
    const { user } = renderRegister()

    await fillForm(user)
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe('RegisterPage — accessibility', () => {
  it('email input is aria-required', () => {
    renderRegister()
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('aria-required', 'true')
  })

  it('password input is aria-required', () => {
    renderRegister()
    expect(screen.getByLabelText(/^password$/i)).toHaveAttribute('aria-required', 'true')
  })

  it('confirm password input is aria-required', () => {
    renderRegister()
    expect(screen.getByLabelText(/confirm password/i)).toHaveAttribute('aria-required', 'true')
  })

  it('marks email field aria-invalid after validation failure', async () => {
    const { user } = renderRegister()
    await user.click(screen.getByRole('button', { name: /create account/i }))
    expect(screen.getByLabelText(/email address/i)).toHaveAttribute('aria-invalid', 'true')
  })
})
