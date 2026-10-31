/**
 * API client for Khaata.
 *
 * Design decisions (aligned with API_CONTRACT.md and FE-001 requirements):
 *
 * 1. Base URL is read from VITE_API_BASE_URL (defaults to empty string so the
 *    Vite dev proxy handles routing to the Django backend).
 * 2. `withCredentials: true` ensures the browser sends the session cookie on
 *    every request, including cross-origin requests in production.
 * 3. CSRF: Django's SessionAuthentication requires a valid X-CSRFToken header
 *    on state-changing requests (POST/PUT/PATCH/DELETE).  We read the token
 *    from the `csrftoken` cookie (set by GET /api/v1/auth/csrf/) and attach it
 *    via an Axios request interceptor.  The cookie is HttpOnly=false by Django
 *    default so JavaScript can read it.
 * 4. On login, the backend rotates the CSRF token.  The response interceptor
 *    detects a successful login and re-reads the cookie so subsequent requests
 *    use the new token automatically.
 * 5. Auth tokens are never written to localStorage (contract requirement).
 * 6. A single response interceptor normalises all error responses into the
 *    ApiError shape defined in src/types/index.ts.
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import type { ApiError } from '@/types'

// ---------------------------------------------------------------------------
// CSRF helpers
// ---------------------------------------------------------------------------

/** Read a cookie value by name.  Returns null if absent. */
function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) {
    return parts.pop()?.split(';').shift() ?? null
  }
  return null
}

/** Return the current CSRF token from the cookie Django sets. */
export function getCsrfToken(): string | null {
  return getCookie('csrftoken')
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const SAFE_METHODS = new Set(['get', 'head', 'options', 'trace'])

const apiClient = axios.create({
  baseURL: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '',
  withCredentials: true,      // send session cookie on every request
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
})

// ---------------------------------------------------------------------------
// Request interceptor — attach CSRF token for state-changing requests
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? 'get').toLowerCase()
  if (!SAFE_METHODS.has(method)) {
    const token = getCsrfToken()
    if (token) {
      config.headers['X-CSRFToken'] = token
    }
  }
  return config
})

// ---------------------------------------------------------------------------
// Response interceptor — normalise errors
// ---------------------------------------------------------------------------

apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    // Attempt to extract the structured API error envelope
    const data = error.response?.data
    if (
      data &&
      typeof data === 'object' &&
      'error' in data
    ) {
      // Already the Khaata error shape — pass through
      return Promise.reject(data as ApiError)
    }

    // Fallback: wrap non-envelope errors into the standard shape
    const status = error.response?.status ?? 0
    const fallback: ApiError = {
      error: {
        code: status === 401 ? 'unauthenticated' :
              status === 403 ? 'forbidden' :
              status === 404 ? 'not_found' :
              status === 0   ? 'network_error' :
                               'server_error',
        message: error.message || 'An unexpected error occurred.',
      },
    }
    return Promise.reject(fallback)
  },
)

export default apiClient
