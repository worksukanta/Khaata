/**
 * HomePage — application landing page (UX-03).
 *
 * FE-001 scope: renders the verified application shell with the correct
 * heading and a brief status message.  No API calls, no financial data.
 * The full combined monthly dashboard is FE-005.
 */

export default function HomePage() {
  return (
    <div className="space-y-6">
      {/* Page heading */}
      <header>
        <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
          Welcome to Khaata
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Your personal expense tracker.
        </p>
      </header>

      {/* Shell verification card */}
      <section
        className="rounded-card border border-border bg-surface p-4"
        aria-label="Application status"
      >
        <h2 className="text-sm font-semibold text-text-primary">
          Foundation ready
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-text-secondary">
          <li className="flex items-center gap-2">
            <span className="text-success-text" aria-hidden="true">✓</span>
            React application renders
          </li>
          <li className="flex items-center gap-2">
            <span className="text-success-text" aria-hidden="true">✓</span>
            Routing works (navigate via the menu)
          </li>
          <li className="flex items-center gap-2">
            <span className="text-success-text" aria-hidden="true">✓</span>
            Responsive layout — try resizing below 1024 px
          </li>
          <li className="flex items-center gap-2">
            <span className="text-success-text" aria-hidden="true">✓</span>
            Tailwind design tokens loaded (emerald brand, background, borders)
          </li>
        </ul>
      </section>
    </div>
  )
}
