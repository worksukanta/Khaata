/**
 * Tests for AuthContext / AuthProvider / useAuth hook.
 *
 * Covers:
 *  - Session restoration on mount (success and 401/network error)
 *  - initializing state while /auth/me/ is in flight
 *  - login() success, CSRF refresh via auth service, user state update
 *  - login() failure (error propagated to caller)
 *  - register() success — does NOT log the user in (per API contract)
 *  - register() failure (duplicate email error propagated)
 *  - logout() success and user state clearing
 *  - logout() calls the auth service
 *  - useAuth outside provider throws
 */

import { render, screen, act, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mock the auth service
// ---------------------------------------------------------------------------

vi.mock('@/services/api/auth', () => ({
  bootstrapCsrf: vi.fn(),
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  register: vi.fn(),
}))

import * as authService from '@/services/api/auth'
import { AuthProvider, useAuth } from '@/features/auth/AuthContext'
import type { User } from '@/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockUser: User = {
  id: 'abc-123',
  email: 'test@example.com',
  display_name: 'Test User',
  timezone: 'Asia/Kolkata',
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function AuthStateDisplay() {
  const { initializing, user } = useAuth()
  if (initializing) return <div>initializing</div>
  return <div>{user ? `user:${user.email}` : 'no-user'}</div>
}

function Wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

// ---------------------------------------------------------------------------
// Describe: session restoration on mount
// ---------------------------------------------------------------------------

describe('AuthProvider — session restoration', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows initializing=true initially then shows user when /me/ succeeds', async () => {
    vi.mocked(authService.bootstrapCsrf).mockResolvedValue(undefined)
    vi.mocked(authService.getMe).mockResolvedValue(mockUser)

    render(<AuthStateDisplay />, { wrapper: Wrapper })

    // Initially must be in the initializing state
    expect(screen.getByText('initializing')).toBeInTheDocument()

    await waitFor(() =>
      expect(screen.getByText(`user:${mockUser.email}`)).toBeInTheDocument(),
    )
    expect(authService.bootstrapCsrf).toHaveBeenCalledOnce()
    expect(authService.getMe).toHaveBeenCalledOnce()
  })

  it('shows no-user when /me/ returns 401 (unauthenticated)', async () => {
    vi.mocked(authService.bootstrapCsrf).mockResolvedValue(undefined)
    vi.mocked(authService.getMe).mockRejectedValue({
      error: { code: 'unauthenticated', message: 'Not authenticated.' },
    })

    render(<AuthStateDisplay />, { wrapper: Wrapper })

    await waitFor(() => expect(screen.getByText('no-user')).toBeInTheDocument())
  })

  it('shows no-user on network error during session restore', async () => {
    vi.mocked(authService.bootstrapCsrf).mockRejectedValue({
      error: { code: 'network_error', message: 'Network error.' },
    })

    render(<AuthStateDisplay />, { wrapper: Wrapper })

    await waitFor(() => expect(screen.getByText('no-user')).toBeInTheDocument())
  })
})

// ---------------------------------------------------------------------------
// Describe: login
// ---------------------------------------------------------------------------

describe('AuthProvider — login()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.bootstrapCsrf).mockResolvedValue(undefined)
    // Start unauthenticated
    vi.mocked(authService.getMe)
      .mockRejectedValueOnce({ error: { code: 'unauthenticated', message: '' } })
  })

  it('updates user state after successful login', async () => {
    vi.mocked(authService.login).mockResolvedValue(undefined)
    // Second getMe call after login
    vi.mocked(authService.getMe).mockResolvedValueOnce(mockUser)

    let loginFn!: (e: string, p: string) => Promise<void>
    function LoginCapture() {
      const auth = useAuth()
      loginFn = auth.login
      return <AuthStateDisplay />
    }

    render(<LoginCapture />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByText('no-user')).toBeInTheDocument())

    await act(async () => { await loginFn('test@example.com', 'password') })

    expect(screen.getByText(`user:${mockUser.email}`)).toBeInTheDocument()
  })

  it('calls auth service login with provided credentials', async () => {
    vi.mocked(authService.login).mockResolvedValue(undefined)
    vi.mocked(authService.getMe).mockResolvedValueOnce(mockUser)

    let loginFn!: (e: string, p: string) => Promise<void>
    function LoginCapture() {
      const auth = useAuth()
      loginFn = auth.login
      return null
    }

    render(<LoginCapture />, { wrapper: Wrapper })
    await waitFor(() => { /* wait for init */ })

    await act(async () => { await loginFn('user@example.com', 'mypassword') })

    expect(authService.login).toHaveBeenCalledWith('user@example.com', 'mypassword')
  })

  it('propagates error from auth service to caller', async () => {
    const authError = { error: { code: 'authentication_failed', message: 'Invalid credentials.' } }
    vi.mocked(authService.login).mockRejectedValue(authError)

    let loginFn!: (e: string, p: string) => Promise<void>
    function LoginCapture() {
      const auth = useAuth()
      loginFn = auth.login
      return null
    }

    render(<LoginCapture />, { wrapper: Wrapper })
    await waitFor(() => { /* wait for init */ })

    await expect(act(async () => { await loginFn('bad@bad.com', 'wrong') })).rejects.toEqual(authError)
  })
})

// ---------------------------------------------------------------------------
// Describe: register
// ---------------------------------------------------------------------------

describe('AuthProvider — register()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.bootstrapCsrf).mockResolvedValue(undefined)
    vi.mocked(authService.getMe).mockRejectedValue({
      error: { code: 'unauthenticated', message: '' },
    })
  })

  it('returns the created user object', async () => {
    vi.mocked(authService.register).mockResolvedValue(mockUser)

    let registerFn!: (e: string, p: string, n: string) => Promise<User>
    let result: User | undefined
    function RegisterCapture() {
      const auth = useAuth()
      registerFn = auth.register
      return null
    }

    render(<RegisterCapture />, { wrapper: Wrapper })
    await waitFor(() => { /* wait for init */ })

    await act(async () => {
      result = await registerFn('new@example.com', 'password1234', 'New User')
    })

    expect(result).toEqual(mockUser)
  })

  it('does NOT log the user in after successful registration', async () => {
    vi.mocked(authService.register).mockResolvedValue(mockUser)

    let registerFn!: (e: string, p: string, n: string) => Promise<User>
    function RegisterCapture() {
      const auth = useAuth()
      registerFn = auth.register
      return <AuthStateDisplay />
    }

    render(<RegisterCapture />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByText('no-user')).toBeInTheDocument())

    await act(async () => {
      await registerFn('new@example.com', 'password1234', 'New User')
    })

    // User must remain null — no automatic session after registration
    expect(screen.getByText('no-user')).toBeInTheDocument()
    // login must not have been called
    expect(authService.login).not.toHaveBeenCalled()
  })

  it('propagates duplicate-email validation error to caller', async () => {
    const dupError = {
      error: {
        code: 'validation_error',
        message: 'The request contains invalid fields.',
        details: { email: ['A user with this email already exists.'] },
      },
    }
    vi.mocked(authService.register).mockRejectedValue(dupError)

    let registerFn!: (e: string, p: string, n: string) => Promise<User>
    function RegisterCapture() {
      const auth = useAuth()
      registerFn = auth.register
      return null
    }

    render(<RegisterCapture />, { wrapper: Wrapper })
    await waitFor(() => { /* wait for init */ })

    await expect(
      act(async () => { await registerFn('dup@example.com', 'password1234', 'Dup') }),
    ).rejects.toEqual(dupError)
  })
})

// ---------------------------------------------------------------------------
// Describe: logout
// ---------------------------------------------------------------------------

describe('AuthProvider — logout()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.bootstrapCsrf).mockResolvedValue(undefined)
    vi.mocked(authService.getMe).mockResolvedValue(mockUser)
    vi.mocked(authService.logout).mockResolvedValue(undefined)
  })

  it('clears user state after logout', async () => {
    let logoutFn!: () => Promise<void>
    function LogoutCapture() {
      const auth = useAuth()
      logoutFn = auth.logout
      return <AuthStateDisplay />
    }

    render(<LogoutCapture />, { wrapper: Wrapper })
    await waitFor(() => expect(screen.getByText(`user:${mockUser.email}`)).toBeInTheDocument())

    await act(async () => { await logoutFn() })

    expect(screen.getByText('no-user')).toBeInTheDocument()
  })

  it('calls the auth service logout', async () => {
    let logoutFn!: () => Promise<void>
    function LogoutCapture() {
      const auth = useAuth()
      logoutFn = auth.logout
      return null
    }

    render(<LogoutCapture />, { wrapper: Wrapper })
    await waitFor(() => { /* wait for init */ })

    await act(async () => { await logoutFn() })

    expect(authService.logout).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Describe: useAuth outside provider
// ---------------------------------------------------------------------------

describe('useAuth outside provider', () => {
  it('throws a meaningful error when used outside <AuthProvider>', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<AuthStateDisplay />)).toThrow(
      'useAuth must be used inside <AuthProvider>',
    )
    spy.mockRestore()
  })
})
