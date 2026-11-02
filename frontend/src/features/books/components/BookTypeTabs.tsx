/**
 * BookTypeTabs — navigation between the three book types.
 *
 * Implemented as links (not ARIA tabs) so each type has a shareable,
 * refresh-safe URL (`/books?tab=event`).  The active type's purpose is
 * explained underneath so the distinction between types is clear.
 */

import { Link } from 'react-router-dom'
import type { BooksTab } from '../types'

const TAB_META: Record<BooksTab, { label: string; description: string }> = {
  monthly: {
    label: 'Monthly',
    description:
      'One book per calendar month, created automatically when you open a month. Dates are fixed and monthly books cannot be archived.',
  },
  event: {
    label: 'Event',
    description:
      'Books you create for a specific occasion or trip, with optional start and end dates. They can be edited and archived.',
  },
  general: {
    label: 'General',
    description:
      'Open-ended books you create for any ongoing purpose. They can be edited and archived.',
  },
}

const ORDER: BooksTab[] = ['monthly', 'event', 'general']

export default function BookTypeTabs({ active }: { active: BooksTab }) {
  return (
    <div>
      <nav aria-label="Book types" className="flex gap-1 rounded-card border border-border bg-surface p-1">
        {ORDER.map((tab) => (
          <Link
            key={tab}
            to={`/books?tab=${tab}`}
            aria-current={tab === active ? 'page' : undefined}
            className={`flex min-h-touch flex-1 items-center justify-center rounded-input px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-700 ${
              tab === active
                ? 'bg-brand-50 text-brand-700'
                : 'text-text-secondary hover:bg-gray-100 hover:text-text-primary'
            }`}
          >
            {TAB_META[tab].label}
          </Link>
        ))}
      </nav>
      <p className="mt-3 text-sm text-text-secondary">{TAB_META[active].description}</p>
    </div>
  )
}
