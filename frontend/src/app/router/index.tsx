/**
 * Application router.
 *
 * Route inventory aligned with UI_UX_SPECIFICATION.md section 4:
 *
 *  /           → Home (dashboard) — UX-03   [protected]
 *  /login      → Login — UX-01              [public-only: redirects home if authenticated]
 *  /register   → Register — UX-02           [public-only: redirects home if authenticated]
 *  /books      → Books list — UX-04         [protected]
 *  /books/:id  → Book detail — UX-05        [protected]
 *  /transactions/new     → Quick add — UX-06       [protected]
 *  /transactions/:id/edit → Edit transaction — UX-07 [protected]
 *  /budgets              → Budgets — UX-08  [protected]
 *  /budgets/:id          → Budget detail — UX-09   [protected]
 *  /reports              → Reports — UX-10  [protected]
 *  /settings             → Settings — UX-11 [protected]
 *
 * FE-002: Login and Register are real pages; all other protected routes still
 * render placeholder pages (implemented in FE-003+).  Route guards are active.
 */

import { createBrowserRouter } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import HomePage from '@/features/home/HomePage'
import NotFoundPage from '@/components/layout/NotFoundPage'
import PlaceholderPage from '@/components/layout/PlaceholderPage'
import LoginPage from '@/features/auth/LoginPage'
import RegisterPage from '@/features/auth/RegisterPage'
import PrivateRoute from '@/features/auth/PrivateRoute'
import PublicOnlyRoute from '@/features/auth/PublicOnlyRoute'

const router = createBrowserRouter([
  {
    // Public-only routes — redirect home when already authenticated
    element: <PublicOnlyRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    // Protected routes — wrapped in AppShell layout
    path: '/',
    element: <PrivateRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'books', element: <PlaceholderPage title="Books" /> },
          { path: 'books/:id', element: <PlaceholderPage title="Book Detail" /> },
          { path: 'transactions/new', element: <PlaceholderPage title="Add Transaction" /> },
          { path: 'transactions/:id/edit', element: <PlaceholderPage title="Edit Transaction" /> },
          { path: 'budgets', element: <PlaceholderPage title="Budgets" /> },
          { path: 'budgets/:id', element: <PlaceholderPage title="Budget Detail" /> },
          { path: 'reports', element: <PlaceholderPage title="Reports" /> },
          { path: 'settings', element: <PlaceholderPage title="Settings" /> },
        ],
      },
    ],
  },
  // 404 catch-all
  { path: '*', element: <NotFoundPage /> },
])

export default router
