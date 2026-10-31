/**
 * LoginPage — UX-01 (/login)
 *
 * Clean fintech light design with emerald accents.
 * Implements:
 *  - Email + password form with client-side validation
 *  - API error display (credential failures, network errors)
 *  - Loading / disabled state during submission
 *  - Redirect to the originally requested route after success
 *  - Link to /register for new users
 *
 * Fields and validation follow the backend contract exactly:
 *  - email: required, valid email format
 *  - password: required, non-empty
 */

import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import type { ApiError } from '@/types'

interface FormErrors {
  email?: string
  password?: string
}

function validate(email: string, password: string): FormErrors {
  const errors: FormErrors = {}
  if (!email.trim()) {
    errors.email = 'Email is required.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (!password) {
    errors.password = 'Password is required.'
  }
  return errors
}

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Destination to return to after successful login
  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/'

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setApiError(null)

    const errors = validate(email, password)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    try {
      await login(email.trim().toLowerCase(), password)
      navigate(from, { replace: true })
    } catch (err) {
      const apiErr = err as ApiError
      const message =
        apiErr?.error?.message ?? 'Login failed. Please check your credentials.'
      setApiError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
            Khaata
          </h1>
          <p className="mt-1 text-body text-text-secondary">Sign in to your account</p>
        </div>

        <div className="rounded-card border border-border bg-surface p-6 shadow-sm">
          {/* API-level error banner */}
          {apiError && (
            <div
              role="alert"
              className="mb-4 rounded-input border border-danger-text bg-danger-bg px-4 py-3 text-sm text-danger-text"
            >
              {apiError}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate aria-label="Sign in form">
            {/* Email */}
            <div className="mb-4">
              <label
                htmlFor="login-email"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                required
                aria-required="true"
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'login-email-error' : undefined}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="block w-full min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder-text-secondary focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="you@example.com"
              />
              {fieldErrors.email && (
                <p id="login-email-error" role="alert" className="mt-1 text-sm text-danger-text">
                  {fieldErrors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="mb-6">
              <label
                htmlFor="login-password"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                aria-required="true"
                aria-invalid={!!fieldErrors.password}
                aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="block w-full min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder-text-secondary focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="••••••••"
              />
              {fieldErrors.password && (
                <p
                  id="login-password-error"
                  role="alert"
                  className="mt-1 text-sm text-danger-text"
                >
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center min-h-touch rounded-input bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              aria-busy={submitting}
            >
              {submitting ? (
                <>
                  <svg
                    className="mr-2 h-4 w-4 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>
        </div>

        {/* Link to register */}
        <p className="mt-6 text-center text-sm text-text-secondary">
          Don&apos;t have an account?{' '}
          <Link
            to="/register"
            className="font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
