/**
 * AppProviders — wraps the application with global context providers.
 *
 * FE-001: only the RouterProvider is wired here.
 * FE-002 will add an AuthProvider.
 * State-management libraries (Redux, Zustand) are not added in V1 without
 * an explicit requirement (see AGENTS.md §10).
 */

import { RouterProvider } from 'react-router-dom'
import router from '@/app/router'

export default function AppProviders() {
  return <RouterProvider router={router} />
}
