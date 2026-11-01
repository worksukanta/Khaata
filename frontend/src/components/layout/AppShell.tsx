/**
 * AppShell — root layout component for authenticated routes.
 *
 * Implements the responsive navigation layout from UI_UX_SPECIFICATION.md §3:
 *  - Mobile (< 1024px): Topbar (hamburger + user menu) + MobileDrawer + BottomNav.
 *  - Desktop (>= 1024px): fixed left Sidebar (240px) + sticky Topbar (user menu) +
 *    main content area (max 1200px).
 *
 * The <Outlet /> renders the active route's page inside the shell.
 */

import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileDrawer from './MobileDrawer'

export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background text-text-primary antialiased">
      {/* Desktop sidebar — hidden below lg breakpoint */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-sidebar lg:flex-col">
        <Sidebar />
      </div>

      {/* Mobile drawer — rendered only when open */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      {/* Right-side column: topbar + main content */}
      <div className="flex min-h-screen flex-col lg:pl-sidebar">
        {/* Sticky top bar */}
        <Topbar onMenuOpen={() => setDrawerOpen(true)} />

        {/* Main content area */}
        <main className="flex-1">
          <div className="mx-auto max-w-content px-4 py-6 pb-24 lg:pb-6">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom navigation — hidden at lg and above */}
        <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden">
          <BottomNav />
        </div>
      </div>
    </div>
  )
}
