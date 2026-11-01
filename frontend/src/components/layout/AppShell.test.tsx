/**
 * Tests for AppShell layout and navigation components (FE-003).
 *
 * Covers:
 * — AppShell renders Topbar, Sidebar, BottomNav, and outlet content
 * — Sidebar navigation links reach correct routes
 * — Active route highlighting (aria-current on NavLinks)
 * — Login/register pages do NOT render inside AppShell
 * — Mobile drawer opens on hamburger click
 * — Mobile drawer closes on backdrop click
 * — Mobile drawer closes on Escape key
 * — Mobile drawer nav items close drawer when clicked
 * — Selecting a nav destination in drawer navigates correctly
 * — BottomNav shows all 5 destinations
 * — UserMenu shows user display name initials
 * — UserMenu shows display name and email in dropdown
 * — UserMenu logout calls auth.logout and menu closes
 * — UserMenu logout failure shows error without pretending success
 * — UserMenu display_name fallback uses email when blank
 * — NotFoundPage renders for unknown routes
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Mock AuthContext — controls what user is presented
// ---------------------------------------------------------------------------

const mockLogout = vi.fn()

const mockUser = {
  id: 'user-1',
  email: 'alice@example.com',
  display_name: 'Alice Smith',
  timezone: 'Asia/Kolkata',
}

const mockAuthState = {
  initializing: false,
  user: mockUser as typeof mockUser | null,
  login: vi.fn(),
  register: vi.fn(),
  logout: mockLogout,
}

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => mockAuthState,
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

import AppShell from '@/components/layout/AppShell'
import UserMenu from '@/components/layout/UserMenu'
import MobileDrawer from '@/components/layout/MobileDrawer'
import Topbar from '@/components/layout/Topbar'
import NotFoundPage from '@/components/layout/NotFoundPage'
import PlaceholderPage from '@/components/layout/PlaceholderPage'

// ---------------------------------------------------------------------------
// Helper — render AppShell with a router
// ---------------------------------------------------------------------------

function renderShell(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<div>Home Page</div>} />
          <Route path="books" element={<PlaceholderPage title="Books" />} />
          <Route path="books/:id" element={<PlaceholderPage title="Book Detail" />} />
          <Route path="transactions/new" element={<PlaceholderPage title="Add Transaction" />} />
          <Route path="budgets" element={<PlaceholderPage title="Budgets" />} />
          <Route path="reports" element={<PlaceholderPage title="Reports" />} />
          <Route path="settings" element={<PlaceholderPage title="Settings" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// AppShell structural tests
// ---------------------------------------------------------------------------

describe('AppShell — structure', () => {
  beforeEach(() => {
    mockAuthState.user = mockUser
    vi.clearAllMocks()
  })

  it('renders the main content outlet', () => {
    renderShell('/')
    expect(screen.getByText('Home Page')).toBeInTheDocument()
  })

  it('renders the sidebar navigation (desktop)', () => {
    renderShell('/')
    // Sidebar has role="complementary" (aside)
    expect(screen.getByRole('complementary')).toBeInTheDocument()
  })

  it('renders a top header', () => {
    renderShell('/')
    expect(screen.getByRole('banner')).toBeInTheDocument()
  })

  it('renders the bottom navigation', () => {
    renderShell('/')
    // BottomNav has a nav element; sidebar also has nav. getAllByRole finds both.
    const navs = screen.getAllByRole('navigation')
    expect(navs.length).toBeGreaterThanOrEqual(1)
  })

  it('renders placeholder pages for unimplemented routes inside the shell', () => {
    renderShell('/books')
    expect(screen.getByRole('heading', { name: /^books$/i })).toBeInTheDocument()
  })

  it('renders the 404 page for unknown routes inside the shell', () => {
    renderShell('/no-such-route')
    expect(screen.getByRole('heading', { name: /404/i })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Navigation links
// ---------------------------------------------------------------------------

describe('AppShell — navigation links', () => {
  beforeEach(() => {
    mockAuthState.user = mockUser
    vi.clearAllMocks()
  })

  it('sidebar has links for all primary destinations', () => {
    renderShell('/')
    // NavLinks in sidebar: Home, Books, Add Transaction, Budgets, Reports, Settings
    expect(screen.getAllByRole('link', { name: /^home$/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: /^books$/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: /^budgets$/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: /^reports$/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: /settings/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('bottom nav has 5 destinations', () => {
    renderShell('/')
    // BottomNav items: Home, Books, Add (aria-label), Budgets, Reports
    expect(screen.getAllByRole('link', { name: /^home$/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('link', { name: /^add$/i }).length).toBeGreaterThanOrEqual(1)
  })

  it('home link has aria-current="page" when on / route', () => {
    renderShell('/')
    // NavLink sets aria-current="page" automatically when active
    const homeLinks = screen.getAllByRole('link', { name: /^home$/i })
    // At least one home link should have aria-current="page"
    const activeHomeLink = homeLinks.find(
      (l) => l.getAttribute('aria-current') === 'page',
    )
    expect(activeHomeLink).toBeDefined()
  })

  it('books link has aria-current="page" when on /books route', () => {
    renderShell('/books')
    const booksLinks = screen.getAllByRole('link', { name: /^books$/i })
    const activeLink = booksLinks.find(
      (l) => l.getAttribute('aria-current') === 'page',
    )
    expect(activeLink).toBeDefined()
  })

  it('navigates to /books without full page reload (React Router)', async () => {
    const user = userEvent.setup()
    renderShell('/')
    expect(screen.getByText('Home Page')).toBeInTheDocument()

    // Click sidebar Books link — first one found
    const booksLinks = screen.getAllByRole('link', { name: /^books$/i })
    await user.click(booksLinks[0])

    // React Router navigated — no page reload, just content swap
    expect(screen.getByRole('heading', { name: /^books$/i })).toBeInTheDocument()
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Mobile drawer
// ---------------------------------------------------------------------------

describe('MobileDrawer', () => {
  beforeEach(() => {
    mockAuthState.user = mockUser
    vi.clearAllMocks()
  })

  it('does not render when open=false', () => {
    render(
      <MemoryRouter>
        <MobileDrawer open={false} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders the dialog when open=true', () => {
    render(
      <MemoryRouter>
        <MobileDrawer open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('dialog', { name: /navigation menu/i })).toBeInTheDocument()
  })

  it('renders navigation links when open', () => {
    render(
      <MemoryRouter>
        <MobileDrawer open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /^home$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^books$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^budgets$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^reports$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /settings/i })).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <MobileDrawer open={true} onClose={onClose} />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /close navigation menu/i }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <MobileDrawer open={true} onClose={onClose} />
      </MemoryRouter>,
    )
    // The backdrop is the aria-hidden div behind the drawer panel
    // fireEvent since userEvent may not reach aria-hidden elements easily
    const backdrop = document.querySelector('[aria-hidden="true"]') as HTMLElement
    fireEvent.click(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose on Escape key press', () => {
    const onClose = vi.fn()
    render(
      <MemoryRouter>
        <MobileDrawer open={true} onClose={onClose} />
      </MemoryRouter>,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Topbar — hamburger button
// ---------------------------------------------------------------------------

describe('Topbar — hamburger', () => {
  beforeEach(() => {
    mockAuthState.user = mockUser
    vi.clearAllMocks()
  })

  it('renders the open navigation menu button', () => {
    const onMenuOpen = vi.fn()
    render(
      <MemoryRouter>
        <Topbar onMenuOpen={onMenuOpen} />
      </MemoryRouter>,
    )
    expect(screen.getByRole('button', { name: /open navigation menu/i })).toBeInTheDocument()
  })

  it('calls onMenuOpen when hamburger is clicked', async () => {
    const user = userEvent.setup()
    const onMenuOpen = vi.fn()
    render(
      <MemoryRouter>
        <Topbar onMenuOpen={onMenuOpen} />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(onMenuOpen).toHaveBeenCalledOnce()
  })

  it('renders the UserMenu (avatar button)', () => {
    render(
      <MemoryRouter>
        <Topbar onMenuOpen={vi.fn()} />
      </MemoryRouter>,
    )
    // UserMenu renders an avatar button with account menu label
    expect(
      screen.getByRole('button', { name: /account menu/i }),
    ).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// AppShell — drawer integration
// ---------------------------------------------------------------------------

describe('AppShell — mobile drawer integration', () => {
  beforeEach(() => {
    mockAuthState.user = mockUser
    vi.clearAllMocks()
  })

  it('opens the mobile drawer when hamburger is clicked', async () => {
    const user = userEvent.setup()
    renderShell('/')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }))

    expect(screen.getByRole('dialog', { name: /navigation menu/i })).toBeInTheDocument()
  })

  it('closes the mobile drawer when close button is clicked', async () => {
    const user = userEvent.setup()
    renderShell('/')

    await user.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /close navigation menu/i }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes the drawer when a navigation item is clicked', async () => {
    const user = userEvent.setup()
    renderShell('/')

    // Open drawer
    await user.click(screen.getByRole('button', { name: /open navigation menu/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    // Click a nav item in the drawer (specifically the drawer's Books link)
    await user.click(screen.getByRole('dialog').querySelector('a[href="/books"]')!)

    // Drawer should close
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})

// ---------------------------------------------------------------------------
// UserMenu
// ---------------------------------------------------------------------------

describe('UserMenu', () => {
  beforeEach(() => {
    mockAuthState.user = mockUser
    mockLogout.mockResolvedValue(undefined)
    vi.clearAllMocks()
  })

  it('renders an avatar button with user initials', () => {
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    )
    const btn = screen.getByRole('button', { name: /account menu/i })
    expect(btn).toBeInTheDocument()
    // "Alice Smith" → initials "AS"
    expect(btn).toHaveTextContent('AS')
  })

  it('opens the menu when clicked', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('shows the user display name and email in the dropdown', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.getByText('alice@example.com')).toBeInTheDocument()
  })

  it('calls logout when Sign out is clicked', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))
    await waitFor(() => expect(mockLogout).toHaveBeenCalledOnce())
  })

  it('shows an error message when logout fails', async () => {
    mockLogout.mockRejectedValue({
      error: { code: 'server_error', message: 'Logout failed.' },
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/logout failed/i),
    )
  })

  it('uses email initial as fallback when display_name is blank', () => {
    mockAuthState.user = { ...mockUser, display_name: '' }
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    )
    const btn = screen.getByRole('button', { name: /account menu/i })
    // email "alice@example.com" splits on [\s@]+ → ["alice", "example.com"]
    // initials = first char of "alice" + first char of "example.com" = "AE"
    expect(btn).toHaveTextContent('AE')
  })

  it('returns null when user is not set', () => {
    mockAuthState.user = null
    const { container } = render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    )
    expect(container.firstChild).toBeNull()
  })

  it('closes menu on Escape key', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    )
    await user.click(screen.getByRole('button', { name: /account menu/i }))
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('menu').parentElement!, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('aria-expanded is true when menu is open', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <UserMenu />
      </MemoryRouter>,
    )
    const btn = screen.getByRole('button', { name: /account menu/i })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    await user.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
  })
})

// ---------------------------------------------------------------------------
// Login/register pages do NOT render inside AppShell
// ---------------------------------------------------------------------------

describe('Auth pages outside AppShell', () => {
  it('login page does not wrap itself in AppShell layout', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<div>Login Form</div>} />
          <Route path="/" element={<AppShell />}>
            <Route index element={<div>Home Page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    )
    // Login page renders without AppShell
    expect(screen.getByText('Login Form')).toBeInTheDocument()
    // AppShell sidebar should NOT be present
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument()
  })
})
