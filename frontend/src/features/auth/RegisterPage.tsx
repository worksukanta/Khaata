/**
 * RegisterPage — UX-02 (/register)
 *
 * Clean fintech light design with emerald accents.
 * Implements:
 *  - Display name, email, password, confirm-password form
 *  - Client-side validation (required, email format, password min-length,
 *    password confirmation match)
 *  - API error display (duplicate email, validation errors, network errors)
 *  - Loading / disabled state during submission
 *  - Post-registration: does NOT log the user in (per API contract).
 *    Shows a success notice and directs the user to /login.
 *  - Link to /login for existing users
 *
 * Fields follow the backend contract exactly:
 *  - display_name: optional (sent as empty string omitted when blank)
 *  - email: required, valid email format
 *  - password: required, ≥ 10 characters (Django's minimum validator)
 *  - confirm_password: client-side only, not sent to API
 */

import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from './AuthContext'
import type { ApiError } from '@/types'

interface FormErrors {
  display_name?: string
  email?: string
  password?: string
  confirm_password?: string
}

const MIN_PASSWORD_LENGTH = 10

function validate(
  displayName: string,
  email: string,
  password: string,
  confirmPassword: string,
): FormErrors {
  const errors: FormErrors = {}

  if (!email.trim()) {
    errors.email = 'Email is required.'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (!password) {
    errors.password = 'Password is required.'
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }

  if (!confirmPassword) {
    errors.confirm_password = 'Please confirm your password.'
  } else if (password && confirmPassword !== password) {
    errors.confirm_password = 'Passwords do not match.'
  }

  // display_name is optional; no server-side required constraint
  void displayName

  return errors
}

export default function RegisterPage() {
  const { register } = useAuth()

  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FormErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [apiFieldErrors, setApiFieldErrors] = useState<Record<string, string[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setApiError(null)
    setApiFieldErrors({})

    const errors = validate(displayName, email, password, confirmPassword)
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      return
    }
    setFieldErrors({})

    setSubmitting(true)
    try {
      await register(email.trim().toLowerCase(), password, displayName.trim())
      // Registration successful — does NOT log the user in.
      setSuccess(true)
    } catch (err) {
      const apiErr = err as ApiError
      // Surface per-field API errors (e.g. duplicate email → email field)
      if (apiErr?.error?.details) {
        setApiFieldErrors(apiErr.error.details)
      } else {
        setApiError(apiErr?.error?.message ?? 'Registration failed. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="rounded-card border border-border bg-surface p-6 shadow-sm text-center">
            <div
              className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50"
              aria-hidden="true"
            >
              <svg
                className="h-6 w-6 text-brand-700"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="mb-2 text-xl font-semibold text-text-primary">Account created!</h2>
            <p className="mb-6 text-sm text-text-secondary">
              Your account is ready. Please sign in to continue.
            </p>
            <Link
              to="/login"
              className="inline-flex items-center justify-center min-h-touch w-full rounded-input bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-700 focus:ring-offset-2"
            >
              Go to sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-sm">
        {/* Brand header */}
        <div className="mb-8 text-center">
          <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
            Khaata
          </h1>
          <p className="mt-1 text-body text-text-secondary">Create your account</p>
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

          <form onSubmit={handleSubmit} noValidate aria-label="Create account form">
            {/* Display name */}
            <div className="mb-4">
              <label
                htmlFor="reg-display-name"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Display name{' '}
                <span className="text-text-secondary font-normal">(optional)</span>
              </label>
              <input
                id="reg-display-name"
                type="text"
                autoComplete="name"
                aria-invalid={!!fieldErrors.display_name || !!apiFieldErrors.display_name}
                aria-describedby={
                  fieldErrors.display_name || apiFieldErrors.display_name
                    ? 'reg-display-name-error'
                    : undefined
                }
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={submitting}
                className="block w-full min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder-text-secondary focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Rina Gupta"
              />
              {(fieldErrors.display_name || apiFieldErrors.display_name) && (
                <p
                  id="reg-display-name-error"
                  role="alert"
                  className="mt-1 text-sm text-danger-text"
                >
                  {fieldErrors.display_name ?? apiFieldErrors.display_name?.[0]}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="mb-4">
              <label
                htmlFor="reg-email"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Email address
              </label>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                required
                aria-required="true"
                aria-invalid={!!fieldErrors.email || !!apiFieldErrors.email}
                aria-describedby={
                  fieldErrors.email || apiFieldErrors.email ? 'reg-email-error' : undefined
                }
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
                className="block w-full min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder-text-secondary focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="you@example.com"
              />
              {(fieldErrors.email || apiFieldErrors.email) && (
                <p id="reg-email-error" role="alert" className="mt-1 text-sm text-danger-text">
                  {fieldErrors.email ?? apiFieldErrors.email?.[0]}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="mb-4">
              <label
                htmlFor="reg-password"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Password
              </label>
              <input
                id="reg-password"
                type="password"
                autoComplete="new-password"
                required
                aria-required="true"
                aria-invalid={!!fieldErrors.password || !!apiFieldErrors.password}
                aria-describedby={
                  fieldErrors.password || apiFieldErrors.password
                    ? 'reg-password-error'
                    : 'reg-password-hint'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
                className="block w-full min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder-text-secondary focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="••••••••"
              />
              {(fieldErrors.password || apiFieldErrors.password) ? (
                <p id="reg-password-error" role="alert" className="mt-1 text-sm text-danger-text">
                  {fieldErrors.password ?? apiFieldErrors.password?.[0]}
                </p>
              ) : (
                <p id="reg-password-hint" className="mt-1 text-xs text-text-secondary">
                  At least {MIN_PASSWORD_LENGTH} characters.
                </p>
              )}
            </div>

            {/* Confirm password */}
            <div className="mb-6">
              <label
                htmlFor="reg-confirm-password"
                className="mb-1 block text-sm font-medium text-text-primary"
              >
                Confirm password
              </label>
              <input
                id="reg-confirm-password"
                type="password"
                autoComplete="new-password"
                required
                aria-required="true"
                aria-invalid={!!fieldErrors.confirm_password}
                aria-describedby={
                  fieldErrors.confirm_password ? 'reg-confirm-password-error' : undefined
                }
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={submitting}
                className="block w-full min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder-text-secondary focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="••••••••"
              />
              {fieldErrors.confirm_password && (
                <p
                  id="reg-confirm-password-error"
                  role="alert"
                  className="mt-1 text-sm text-danger-text"
                >
                  {fieldErrors.confirm_password}
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
                  Creating account…
                </>
              ) : (
                'Create account'
              )}
            </button>
          </form>
        </div>

        {/* Link to login */}
        <p className="mt-6 text-center text-sm text-text-secondary">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
