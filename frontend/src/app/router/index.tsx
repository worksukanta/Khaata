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
 * FE-002: Login and Register are real pages; route guards are active.
 * FE-004: /books and /books/:id are real pages.
 * FE-005: /transactions/new and /transactions/:id/edit are real pages.
 * FE-006: / (dashboard), /budgets and /budgets/:id are real pages.
 * Other protected routes render placeholder pages.
 */

import { createBrowserRouter } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import HomePage from '@/features/home/HomePage'
import NotFoundPage from '@/components/layout/NotFoundPage'
import PlaceholderPage from '@/components/layout/PlaceholderPage'
import BooksPage from '@/features/books/BooksPage'
import BookDetailsPage from '@/features/books/BookDetailsPage'
import TransactionCreatePage from '@/features/transactions/TransactionCreatePage'
import TransactionEditPage from '@/features/transactions/TransactionEditPage'
import BudgetsPage from '@/features/budgets/BudgetsPage'
import BudgetDetailsPage from '@/features/budgets/BudgetDetailsPage'
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
          { path: 'books', element: <BooksPage /> },
          { path: 'books/:id', element: <BookDetailsPage /> },
          { path: 'transactions/new', element: <TransactionCreatePage /> },
          { path: 'transactions/:id', element: <TransactionEditPage /> },
          { path: 'transactions/:id/edit', element: <TransactionEditPage /> },
          { path: 'budgets', element: <BudgetsPage /> },
          { path: 'budgets/:id', element: <BudgetDetailsPage /> },
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
