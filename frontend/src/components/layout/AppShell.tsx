/**
 * AppShell — root layout component.
 *
 * Implements the responsive navigation layout from UI_UX_SPECIFICATION.md §3:
 *  - Mobile (< 1024px): persistent bottom navigation with 5 destinations.
 *  - Desktop (>= 1024px): left sidebar (240px) + main content area (max 1200px).
 *
 * The <Outlet /> renders the active route's page inside the shell.
 */

import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav'
import Sidebar from './Sidebar'

export default function AppShell() {
  return (
    <div className="min-h-screen bg-background text-text-primary antialiased">
      {/* Desktop sidebar — hidden below lg breakpoint */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-sidebar lg:flex-col">
        <Sidebar />
      </div>

      {/* Main content area */}
      <main className="lg:pl-sidebar">
        <div className="mx-auto max-w-content px-4 py-6 pb-24 lg:pb-6">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom navigation — hidden at lg and above */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
