/**
 * AppProviders — wraps the application with global context providers.
 *
 * Provider order (inner-first):
 *  1. QueryClientProvider — TanStack Query for server-state management.
 *  2. AuthProvider — session state (reads /auth/me/ on mount).
 *  3. RouterProvider — React Router 7 browser router.
 *
 * AuthProvider must be inside QueryClientProvider so auth-related queries
 * can use the shared QueryClient.  RouterProvider is outermost because
 * route guards (PrivateRoute, PublicOnlyRoute) consume AuthContext.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthContext'
import router from '@/app/router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Do not retry on 4xx; only retry on network/5xx errors.
      retry: (failureCount, error) => {
        // error is ApiError shape from our interceptor
        const e = error as { error?: { code?: string } }
        const code = e?.error?.code
        if (
          code === 'unauthenticated' ||
          code === 'forbidden' ||
          code === 'not_found' ||
          code === 'validation_error'
        ) {
          return false
        }
        return failureCount < 2
      },
      staleTime: 30_000,          // 30 s before a background refetch
      refetchOnWindowFocus: true,
    },
  },
})

export default function AppProviders() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>
  )
}
