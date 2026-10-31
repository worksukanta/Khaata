/**
 * AuthContext — shared authentication state for Khaata.
 *
 * State model:
 *  - initializing: true while the first GET /auth/me/ is in flight (page refresh).
 *  - user: User | null — the authenticated user, or null when logged out.
 *
 * Session is always restored from the server (no localStorage).
 * CSRF bootstrap happens before each state-changing request in auth.ts.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import {
  bootstrapCsrf,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  register as apiRegister,
} from '@/services/api/auth'
import type { User } from '@/types'

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------

interface AuthContextValue {
  /** True during the initial session-restoration check on mount. */
  initializing: boolean
  /** The authenticated user, or null. */
  user: User | null
  /**
   * Log in with email + password.
   * On success the user is set; the auth service re-fetches the CSRF cookie.
   * Throws an ApiError on failure (caller handles display).
   */
  login: (email: string, password: string) => Promise<void>
  /**
   * Register a new account.
   * Returns the created User object.
   * Registration does NOT automatically log the user in (per API contract).
   * Throws an ApiError on failure.
   */
  register: (email: string, password: string, displayName: string) => Promise<User>
  /**
   * Log out.
   * Clears the server session and the local user state.
   * Throws on network failure (caller may choose to surface this).
   */
  logout: () => Promise<void>
}

// ---------------------------------------------------------------------------
// Context creation
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null)
  const [initializing, setInitializing] = useState(true)

  // On mount: bootstrap CSRF, then check whether the browser already has a
  // valid session cookie from a previous visit.
  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      try {
        // Ensure we have a CSRF cookie before any state-changing request.
        await bootstrapCsrf()
        const me = await getMe()
        if (!cancelled) setUser(me)
      } catch {
        // 401 means unauthenticated — this is the normal unauthenticated path.
        // Network errors are swallowed here; the user remains logged out.
        if (!cancelled) setUser(null)
      } finally {
        if (!cancelled) setInitializing(false)
      }
    }

    void restoreSession()
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    // auth.ts login() calls bootstrapCsrf() after login to pick up the
    // rotated CSRF token before we fire the /me/ fetch.
    await apiLogin(email, password)
    const me = await getMe()
    setUser(me)
  }, [])

  const register = useCallback(
    async (email: string, password: string, displayName: string): Promise<User> => {
      // Registration does NOT log the user in (per API contract).
      return apiRegister(email, password, displayName)
    },
    [],
  )

  const logout = useCallback(async () => {
    await apiLogout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ initializing, user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * useAuth — returns the authentication context.
 * Must be called inside an <AuthProvider>.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === null) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
