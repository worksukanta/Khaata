/**
 * BooksPage — Books overview (UX-04, `/books`).
 *
 * Renders the book-type navigation and the panel for the selected type
 * (`?tab=monthly|event|general`, default monthly).  Lives inside the FE-003
 * AppShell; it does not render any global navigation of its own.
 */

import { useSearchParams } from 'react-router-dom'
import BookTypeTabs from './components/BookTypeTabs'
import ManagedBooksPanel from './ManagedBooksPanel'
import MonthlyBooksPanel from './MonthlyBooksPanel'
import type { BooksTab } from './types'

function parseTab(value: string | null): BooksTab {
  return value === 'event' || value === 'general' ? value : 'monthly'
}

export default function BooksPage() {
  const [searchParams] = useSearchParams()
  const tab = parseTab(searchParams.get('tab'))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
          My Books
        </h1>
      </div>

      <BookTypeTabs active={tab} />

      {/* key → filter/dialog state resets when switching type */}
      {tab === 'monthly' && <MonthlyBooksPanel key="monthly" />}
      {tab === 'event' && <ManagedBooksPanel key="event" type="EVENT" />}
      {tab === 'general' && <ManagedBooksPanel key="general" type="GENERAL" />}
    </div>
  )
}
