/**
 * BookDetailsPage — UX-05 (`/books/:id`), Books-related fields only.
 *
 * Shows book metadata and, for EVENT/GENERAL books, edit / archive / restore
 * actions.  Archived books show the "Archived book — read only" banner with a
 * Restore CTA.  Transactions, totals and budgets belong to later milestones.
 *
 * Non-UUID ids are treated as not found without a request; inaccessible or
 * unknown ids (404) render a generic not-found state.
 */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErrorState, LoadingSkeleton } from '@/components/ui/StateViews'
import { useToast } from '@/components/ui/Toast'
import { primaryButton, secondaryButton } from '@/components/ui/styles'
import { getApiErrorCode, getApiErrorMessage } from '@/services/api/errors'
import type { Book } from '@/types'
import ArchiveConfirmationDialog from './components/ArchiveConfirmationDialog'
import BookFormDialog from './components/BookFormDialog'
import { useBook, useRestoreBook } from './hooks/useBooks'
import { formatDate, formatMoney, monthLabel } from './utils'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const TYPE_LABEL: Record<Book['type'], string> = {
  MONTHLY: 'Monthly book',
  EVENT: 'Event book',
  GENERAL: 'General book',
}

function backLink(book?: Book): string {
  if (book?.type === 'EVENT') return '/books?tab=event'
  if (book?.type === 'GENERAL') return '/books?tab=general'
  return '/books'
}

function BookNotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
        Book not found
      </h1>
      <p className="text-text-secondary">
        This book doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link to="/books" className={primaryButton}>
        Back to Books
      </Link>
    </div>
  )
}

export default function BookDetailsPage() {
  const { id } = useParams<{ id: string }>()
  const validId = id && UUID_RE.test(id) ? id : undefined
  const toast = useToast()
  const bookQuery = useBook(validId)
  const restore = useRestoreBook()
  const [dialog, setDialog] = useState<'edit' | 'archive' | null>(null)

  if (!validId) return <BookNotFound />
  if (bookQuery.isPending) return <LoadingSkeleton label="Loading book" rows={2} />

  if (bookQuery.isError) {
    if (getApiErrorCode(bookQuery.error) === 'not_found') return <BookNotFound />
    return (
      <ErrorState
        message={getApiErrorMessage(bookQuery.error, 'Could not load this book.')}
        onRetry={() => void bookQuery.refetch()}
        retrying={bookQuery.isFetching}
      />
    )
  }

  const book = bookQuery.data
  const managed = book.type !== 'MONTHLY'
  const hasDates = book.type === 'EVENT' && (book.start_date || book.end_date)

  async function handleRestore() {
    try {
      await restore.mutateAsync(book.id)
      toast.success(`“${book.name}” restored.`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not restore this book. Please try again.'))
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to={backLink(book)}
        className="inline-flex min-h-touch items-center text-sm font-medium text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-700"
      >
        ← Back to Books
      </Link>

      <div>
        <h1 className="break-words text-title-mobile font-bold text-text-primary lg:text-title-desktop">
          {book.name}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{TYPE_LABEL[book.type]}</p>
      </div>

      {book.is_archived && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-card border border-warning-text bg-warning-bg p-4 text-sm text-warning-text sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="font-medium">Archived book — read only</span>
          {managed && (
            <button
              type="button"
              className={secondaryButton}
              disabled={restore.isPending}
              onClick={handleRestore}
            >
              {restore.isPending ? 'Restoring…' : 'Restore book'}
            </button>
          )}
        </div>
      )}

      <section
        aria-label="Book details"
        className="rounded-card border border-border bg-surface p-4"
      >
        <dl className="grid gap-4 sm:grid-cols-2">
          {book.type === 'MONTHLY' && book.year && book.month && (
            <div>
              <dt className="text-caption text-text-secondary">Month</dt>
              <dd className="text-body text-text-primary">
                {monthLabel({ year: book.year, month: book.month })}
              </dd>
            </div>
          )}
          {hasDates && (
            <>
              <div>
                <dt className="text-caption text-text-secondary">Start date</dt>
                <dd className="text-body text-text-primary">
                  {book.start_date ? formatDate(book.start_date) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">End date</dt>
                <dd className="text-body text-text-primary">
                  {book.end_date ? formatDate(book.end_date) : '—'}
                </dd>
              </div>
            </>
          )}
          <div>
            <dt className="text-caption text-text-secondary">Opening balance</dt>
            <dd className="text-body tabular-nums text-text-primary">
              {formatMoney(book.opening_balance)}
            </dd>
          </div>
          {book.description && (
            <div className="sm:col-span-2">
              <dt className="text-caption text-text-secondary">Description</dt>
              <dd className="whitespace-pre-wrap break-words text-body text-text-primary">
                {book.description}
              </dd>
            </div>
          )}
        </dl>
      </section>

      {managed && !book.is_archived && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButton} onClick={() => setDialog('edit')}>
            Edit book
          </button>
          <button type="button" className={secondaryButton} onClick={() => setDialog('archive')}>
            Archive book
          </button>
        </div>
      )}

      {dialog === 'edit' && book.type !== 'MONTHLY' && (
        <BookFormDialog type={book.type} book={book} onClose={() => setDialog(null)} />
      )}
      {dialog === 'archive' && (
        <ArchiveConfirmationDialog book={book} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
