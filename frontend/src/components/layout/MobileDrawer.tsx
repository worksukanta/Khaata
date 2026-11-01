/**
 * MobileDrawer — slide-in navigation drawer for mobile/tablet viewports.
 *
 * Opens from the left when the hamburger button in Topbar is pressed.
 * Renders the same navigation items as the desktop Sidebar inside a full-height
 * overlay panel.
 *
 * Accessibility:
 *  - `role="dialog"` with `aria-label` and `aria-modal="true"`.
 *  - Focus is moved to the close button when the drawer opens.
 *  - Escape key closes the drawer.
 *  - Backdrop click closes the drawer.
 *  - Selecting a navigation item closes the drawer.
 *  - When closed, the drawer is removed from the DOM (not just hidden)
 *    so it does not participate in the tab order.
 *
 * Spec: UI_UX_SPECIFICATION.md §3 — mobile bottom nav + profile avatar;
 *       tablet "condensed sidebar or bottom navigation based on available width".
 */

import { useEffect, useRef, type KeyboardEvent } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

interface MobileDrawerProps {
  open: boolean
  onClose: () => void
}

interface DrawerItem {
  to: string
  label: string
  icon: React.ReactNode
}

// ---------------------------------------------------------------------------
// Icon components (inline SVG, no icon library dependency)
// ---------------------------------------------------------------------------

function HomeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function BooksIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

function AddIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function BudgetsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function ReportsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

const drawerItems: DrawerItem[] = [
  { to: '/', label: 'Home', icon: <HomeIcon /> },
  { to: '/books', label: 'Books', icon: <BooksIcon /> },
  { to: '/transactions/new', label: 'Add Transaction', icon: <AddIcon /> },
  { to: '/budgets', label: 'Budgets', icon: <BudgetsIcon /> },
  { to: '/reports', label: 'Reports', icon: <ReportsIcon /> },
  { to: '/settings', label: 'Settings', icon: <SettingsIcon /> },
]

export default function MobileDrawer({ open, onClose }: MobileDrawerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  // Close the drawer whenever the route changes (navigation happened).
  // We use a ref to track the previous pathname so we only close on actual
  // changes, not on the initial mount.
  const location = useLocation()
  const prevPathRef = useRef(location.pathname)

  useEffect(() => {
    if (open && location.pathname !== prevPathRef.current) {
      onClose()
    }
    prevPathRef.current = location.pathname
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  // Move focus to close button when drawer opens
  useEffect(() => {
    if (open) {
      closeButtonRef.current?.focus()
    }
  }, [open])

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-label="Navigation menu"
      aria-modal="true"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl">
        {/* Drawer header */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <span className="text-lg font-bold text-brand-700">Khaata</span>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close navigation menu"
            onClick={onClose}
            className="flex min-h-touch min-w-touch items-center justify-center rounded-input text-text-secondary hover:bg-gray-100 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 overflow-y-auto p-3" aria-label="Main navigation">
          <ul className="space-y-1" role="list">
            {drawerItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex min-h-touch items-center gap-3 rounded-input px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
                    }`
                  }
                >
                  {item.icon}
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  )
}
