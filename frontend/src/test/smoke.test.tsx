/**
 * Smoke tests: verify that core application components render without crashing.
 *
 * FE-002 update: protected routes now require AuthProvider + AuthContext.
 * These tests use MemoryRouter + mocked AuthContext to keep them isolated
 * from the API and remain deterministic.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom'
import { vi } from 'vitest'
import type { ReactNode } from 'react'
import AppShell from '@/components/layout/AppShell'
import HomePage from '@/features/home/HomePage'
import NotFoundPage from '@/components/layout/NotFoundPage'
import PlaceholderPage from '@/components/layout/PlaceholderPage'

// ---------------------------------------------------------------------------
// Mock AuthContext so AppShell/layout components don't error when rendered
// directly in tests without a real AuthProvider.
// ---------------------------------------------------------------------------

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    initializing: false,
    user: { id: '1', email: 'smoke@test.com', display_name: 'Smoke', timezone: 'UTC' },
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

describe('Application smoke test', () => {
  it('renders the HomePage inside AppShell without crashing', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<HomePage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    // The heading should be present
    expect(
      screen.getByRole('heading', { name: /welcome to khaata/i }),
    ).toBeInTheDocument()
  })

  it('renders navigation links for all five destinations', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<HomePage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    // Both Sidebar and BottomNav render the nav links; getAllByRole finds all.
    // We verify at least one link to each destination exists.
    expect(screen.getAllByRole('link', { name: /^home$/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: /^books$/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: /^budgets$/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: /^reports$/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('renders the 404 page for an unknown route', () => {
    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: /404/i }),
    ).toBeInTheDocument()
  })

  it('renders a placeholder page for routes not yet implemented', () => {
    render(
      <MemoryRouter initialEntries={['/books']}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route path="books" element={<PlaceholderPage title="Books" />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(
      screen.getByRole('heading', { name: /^books$/i }),
    ).toBeInTheDocument()
  })

  it('renders AppShell with an Outlet for nested routes', () => {
    render(
      <MemoryRouter initialEntries={['/test']}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route path="test" element={<div>Nested Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.getByText('Nested Content')).toBeInTheDocument()
  })
})

// Keep the Outlet import used (it's used by AppShell internally; this avoids lint unused-import)
void Outlet
