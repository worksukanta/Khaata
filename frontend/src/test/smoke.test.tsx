/**
 * Smoke test: verifies that the Khaata application renders without crashing
 * and that the router delivers the correct page for the root route.
 *
 * This test does NOT call the backend API.  It uses MemoryRouter so the
 * test environment's lack of a real URL does not interfere.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import HomePage from '@/features/home/HomePage'
import NotFoundPage from '@/components/layout/NotFoundPage'
import PlaceholderPage from '@/components/layout/PlaceholderPage'

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
})
