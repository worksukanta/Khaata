/**
 * Topbar — application top header bar.
 *
 * Rendered inside AppShell on all authenticated routes.
 * Contains:
 *  - Mobile: hamburger button (opens the mobile drawer), app name
 *  - Desktop: left area (page title placeholder / breadcrumb slot), right area (user menu)
 *  - User menu on all widths (right-aligned)
 *
 * The hamburger button is visible only below the `lg` breakpoint.
 * On desktop the sidebar is always visible so no menu button is needed.
 *
 * Spec: UI_UX_SPECIFICATION.md §3 — desktop top header with user menu;
 *       mobile profile via top-right avatar.
 */

import UserMenu from './UserMenu'

interface TopbarProps {
  /** Called by the hamburger button to open the mobile drawer. */
  onMenuOpen: () => void
}

function HamburgerIcon() {
  return (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  )
}

export default function Topbar({ onMenuOpen }: TopbarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-surface px-4 lg:px-6">
      {/* Left: hamburger (mobile only) */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex min-h-touch min-w-touch items-center justify-center rounded-input text-text-secondary hover:bg-gray-100 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700 lg:hidden"
          aria-label="Open navigation menu"
          onClick={onMenuOpen}
        >
          <HamburgerIcon />
        </button>

        {/* App name — visible on mobile when sidebar is hidden */}
        <span className="text-base font-bold text-brand-700 lg:hidden">Khaata</span>
      </div>

      {/* Right: user menu */}
      <div className="flex items-center gap-3">
        <UserMenu />
      </div>
    </header>
  )
}
