/**
 * Application router.
 *
 * Route inventory aligned with UI_UX_SPECIFICATION.md section 4:
 *
 *  /           → Home (dashboard) — UX-03
 *  /login      → Login — UX-01
 *  /register   → Register — UX-02
 *  /books      → Books list — UX-04
 *  /books/:id  → Book detail — UX-05
 *  /transactions/new     → Quick add — UX-06
 *  /transactions/:id/edit → Edit transaction — UX-07
 *  /budgets              → Budgets — UX-08
 *  /budgets/:id          → Budget detail — UX-09
 *  /reports              → Reports — UX-10
 *  /settings             → Settings — UX-11
 *
 * FE-001 scope: only the shell routes are wired; placeholder pages are
 * rendered for all destinations.  Full screens are FE-002 onward.
 */

import { createBrowserRouter } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import HomePage from '@/features/home/HomePage'
import NotFoundPage from '@/components/layout/NotFoundPage'
import PlaceholderPage from '@/components/layout/PlaceholderPage'

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'login', element: <PlaceholderPage title="Login" /> },
      { path: 'register', element: <PlaceholderPage title="Register" /> },
      { path: 'books', element: <PlaceholderPage title="Books" /> },
      { path: 'books/:id', element: <PlaceholderPage title="Book Detail" /> },
      { path: 'transactions/new', element: <PlaceholderPage title="Add Transaction" /> },
      { path: 'transactions/:id/edit', element: <PlaceholderPage title="Edit Transaction" /> },
      { path: 'budgets', element: <PlaceholderPage title="Budgets" /> },
      { path: 'budgets/:id', element: <PlaceholderPage title="Budget Detail" /> },
      { path: 'reports', element: <PlaceholderPage title="Reports" /> },
      { path: 'settings', element: <PlaceholderPage title="Settings" /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export default router
