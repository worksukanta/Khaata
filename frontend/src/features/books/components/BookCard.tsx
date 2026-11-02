/**
 * BookCard — one book in a list (DESIGN_SYSTEM.md: BookCard).
 *
 * The title links to the book details page.  Edit / Archive / Restore controls
 * are rendered only when the matching callback is supplied; callers never pass
 * them for MONTHLY books.
 */

import { Link } from 'react-router-dom'
import { formatDateRange } from '../utils'
import { secondaryButton } from '@/components/ui/styles'
import type { Book } from '@/types'

const TYPE_LABEL: Record<Book['type'], string> = {
  MONTHLY: 'Monthly',
  EVENT: 'Event',
  GENERAL: 'General',
}

interface BookCardProps {
  book: Book
  onEdit?: (book: Book) => void
  onArchive?: (book: Book) => void
  onRestore?: (book: Book) => void
  /** True while a restore request for this book is in flight. */
  restoring?: boolean
}

export default function BookCard({
  book,
  onEdit,
  onArchive,
  onRestore,
  restoring = false,
}: BookCardProps) {
  const dates = book.type === 'EVENT' ? formatDateRange(book.start_date, book.end_date) : null
  const hasActions = Boolean(onEdit || onArchive || onRestore)

  return (
    <li className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-semibold text-text-primary">
            <Link
              to={`/books/${book.id}`}
              className="rounded-input hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700"
            >
              {book.name}
            </Link>
          </h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-caption text-text-secondary">
            <span className="rounded-input bg-brand-50 px-2 py-1 font-medium text-brand-700">
              {TYPE_LABEL[book.type]}
            </span>
            {book.is_archived && (
              <span className="rounded-input bg-warning-bg px-2 py-1 font-medium text-warning-text">
                Archived
              </span>
            )}
            {dates && <span>{dates}</span>}
          </div>
          {book.description && (
            <p className="mt-2 line-clamp-2 break-words text-sm text-text-secondary">
              {book.description}
            </p>
          )}
        </div>
        <Link
          to={`/books/${book.id}`}
          aria-label={`Open ${book.name}`}
          className={secondaryButton}
        >
          Open
        </Link>
      </div>

      {hasActions && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
          {onEdit && (
            <button
              type="button"
              className={secondaryButton}
              aria-label={`Edit ${book.name}`}
              onClick={() => onEdit(book)}
            >
              Edit
            </button>
          )}
          {onArchive && (
            <button
              type="button"
              className={secondaryButton}
              aria-label={`Archive ${book.name}`}
              onClick={() => onArchive(book)}
            >
              Archive
            </button>
          )}
          {onRestore && (
            <button
              type="button"
              className={secondaryButton}
              aria-label={`Restore ${book.name}`}
              disabled={restoring}
              onClick={() => onRestore(book)}
            >
              {restoring ? 'Restoring…' : 'Restore'}
            </button>
          )}
        </div>
      )}
    </li>
  )
}
