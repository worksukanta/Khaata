/**
 * BottomNav — mobile persistent navigation bar.
 *
 * Five destinations per UI_UX_SPECIFICATION.md §3:
 *   Home, Books, Add (prominent), Budgets, Reports
 *
 * Profile is accessed via the top-right avatar (not in the bottom bar).
 */

import { NavLink } from 'react-router-dom'

interface NavItem {
  to: string
  label: string
  icon: React.ReactNode
  isPrimary?: boolean
}

function HomeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  )
}

function BooksIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  )
}

function AddIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  )
}

function BudgetsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  )
}

function ReportsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  )
}

const navItems: NavItem[] = [
  { to: '/', label: 'Home', icon: <HomeIcon /> },
  { to: '/books', label: 'Books', icon: <BooksIcon /> },
  { to: '/transactions/new', label: 'Add', icon: <AddIcon />, isPrimary: true },
  { to: '/budgets', label: 'Budgets', icon: <BudgetsIcon /> },
  { to: '/reports', label: 'Reports', icon: <ReportsIcon /> },
]

export default function BottomNav() {
  return (
    <nav
      className="border-t border-border bg-surface"
      aria-label="Main navigation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <ul className="flex items-center justify-around" role="list">
        {navItems.map((item) => (
          <li key={item.to} className="flex-1">
            {item.isPrimary ? (
              // Prominent Add button
              <NavLink
                to={item.to}
                aria-label={item.label}
                className="flex min-h-touch flex-col items-center justify-center gap-0.5 py-2"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-700 text-white shadow-md">
                  {item.icon}
                </span>
              </NavLink>
            ) : (
              <NavLink
                to={item.to}
                end={item.to === '/'}
                aria-label={item.label}
                className={({ isActive }) =>
                  `flex min-h-touch flex-col items-center justify-center gap-0.5 py-2 text-xs font-medium transition-colors ${
                    isActive
                      ? 'text-brand-700'
                      : 'text-text-secondary hover:text-text-primary'
                  }`
                }
              >
                {item.icon}
                <span>{item.label}</span>
              </NavLink>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}
