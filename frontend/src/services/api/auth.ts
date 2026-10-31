/**
 * Auth service — thin wrappers around the authentication API endpoints.
 *
 * CSRF strategy (per API_CONTRACT.md section 2):
 *  1. Call bootstrapCsrf() once on app load to obtain the initial csrftoken cookie.
 *  2. After login, the backend rotates the CSRF token; the session cookie is
 *     also set at this point.  The Axios request interceptor reads the updated
 *     cookie automatically on the next request — no manual re-fetch needed here
 *     because Axios re-evaluates getCsrfToken() on every non-safe request.
 *  3. Logout invalidates the session; the next bootstrapCsrf() call will issue
 *     a fresh token for the unauthenticated session.
 */

import apiClient from './client'
import type { User } from '@/types'

const AUTH = '/api/v1/auth'

/**
 * Bootstrap the CSRF cookie.  Call on application start before any
 * state-changing request.  The backend sets the csrftoken cookie;
 * the Axios interceptor will pick it up automatically.
 */
export async function bootstrapCsrf(): Promise<void> {
  await apiClient.get<{ detail: string }>(`${AUTH}/csrf/`)
}

/**
 * Register a new account.
 * Per API_CONTRACT.md §2: registration does NOT automatically log the user in.
 * Returns the created User object (HTTP 201).
 */
export async function register(
  email: string,
  password: string,
  display_name: string,
): Promise<User> {
  const response = await apiClient.post<User>(`${AUTH}/register/`, {
    email,
    password,
    display_name,
  })
  return response.data
}

/** Log in with email + password.  Sets the session cookie. */
export async function login(email: string, password: string): Promise<void> {
  await apiClient.post<{ detail: string }>(`${AUTH}/login/`, { email, password })
  // The backend rotates the CSRF token on successful login.
  // Re-fetch so the new token is in the cookie before the next mutation.
  await bootstrapCsrf()
}

/** Log out.  Clears the server-side session. */
export async function logout(): Promise<void> {
  await apiClient.post<void>(`${AUTH}/logout/`)
}

/** Return the authenticated user's profile. */
export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>(`${AUTH}/me/`)
  return response.data
}
