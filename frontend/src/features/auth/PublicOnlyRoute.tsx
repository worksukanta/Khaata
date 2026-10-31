/**
 * PublicOnlyRoute — redirects authenticated users away from login/register.
 *
 * Behaviour:
 * - While initializing, renders nothing (same anti-flash pattern as PrivateRoute).
 * - Authenticated users are sent to the app home page.
 * - Unauthenticated users see the wrapped route via <Outlet />.
 *
 * This prevents a logged-in user from landing on /login or /register.
 */

import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function PublicOnlyRoute() {
  const { initializing, user } = useAuth()

  if (initializing) {
    return null
  }

  if (user) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
