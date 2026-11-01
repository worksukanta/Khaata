/**
 * UserMenu — authenticated user account menu.
 *
 * Shows the user's display name (or email fallback) as an avatar/trigger.
 * Opens a dropdown with the user's display name, email, and logout action.
 *
 * Uses native browser focus-trap: the popover closes on Escape key and on
 * click outside.  No external dependency needed.
 *
 * Spec reference: UI_UX_SPECIFICATION.md §3 — "profile via top-right avatar"
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useAuth } from '@/features/auth/AuthContext'
import type { ApiError } from '@/types'

function getInitials(displayName: string, email: string): string {
  const name = displayName.trim() || email
  const parts = name.split(/[\s@]+/)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase()
}

export default function UserMenu() {
  const { user, logout } = useAuth()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Close on Escape
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      buttonRef.current?.focus()
    }
  }

  async function handleLogout() {
    setLogoutError(null)
    setLoggingOut(true)
    try {
      await logout()
      // AuthProvider sets user=null; router redirects to /login via PrivateRoute.
    } catch (err) {
      const apiErr = err as ApiError
      setLogoutError(apiErr?.error?.message ?? 'Logout failed. Please try again.')
      setLoggingOut(false)
    }
  }

  if (!user) return null

  const initials = getInitials(user.display_name, user.email)
  const displayLabel = user.display_name.trim() || user.email

  return (
    <div
      ref={menuRef}
      className="relative"
      onKeyDown={handleKeyDown}
    >
      {/* Avatar trigger */}
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Account menu for ${displayLabel}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-700 text-sm font-semibold text-white focus:outline-none focus:ring-2 focus:ring-brand-700 focus:ring-offset-2 hover:bg-brand-600"
      >
        {initials}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-card border border-border bg-surface shadow-lg"
        >
          {/* User info header */}
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-medium text-text-primary">
              {user.display_name.trim() || <span className="text-text-secondary italic">No display name</span>}
            </p>
            <p className="truncate text-xs text-text-secondary">{user.email}</p>
          </div>

          {/* Logout error */}
          {logoutError && (
            <div role="alert" className="px-4 py-2 text-xs text-danger-text bg-danger-bg">
              {logoutError}
            </div>
          )}

          {/* Actions */}
          <div className="p-2">
            <button
              type="button"
              role="menuitem"
              disabled={loggingOut}
              onClick={handleLogout}
              aria-busy={loggingOut}
              className="flex w-full items-center gap-2 rounded-input px-3 py-2 text-sm text-text-secondary hover:bg-gray-100 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg
                className="h-4 w-4 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
              {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
