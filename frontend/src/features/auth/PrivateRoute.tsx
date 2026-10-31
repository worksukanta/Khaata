/**
 * PrivateRoute — protects routes that require authentication.
 *
 * Behaviour:
 * - While the session is initializing (first /auth/me/ check on page load),
 *   renders nothing to prevent a redirect flash.
 * - Once initialized, redirects unauthenticated users to /login, preserving
 *   the original destination in `location.state.from` so LoginPage can return
 *   the user there after a successful login.
 * - Authenticated users are rendered normally via <Outlet />.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'

export default function PrivateRoute() {
  const { initializing, user } = useAuth()
  const location = useLocation()

  // Do not redirect while we are still restoring the session; an immediate
  // redirect would boot the user on every hard refresh even with a valid cookie.
  if (initializing) {
    return null
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
