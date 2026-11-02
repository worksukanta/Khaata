/**
 * ManagedBooksPanel — Event and General tabs of the Books screen (UX-04).
 *
 * One component serves both user-managed types.  Filter state lives in the URL
 * (`q`, `archived`, `page`) so refresh/back preserve context.  Active and
 * archived books use separate queries (`is_archived=false|true`).
 *
 * Archived books are read-only: only Restore is offered.  Archive requires
 * confirmation.
 */

import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/ui/StateViews'
import { useToast } from '@/components/ui/Toast'
import { inputClass, primaryButton } from '@/components/ui/styles'
import { getApiErrorCode, getApiErrorMessage } from '@/services/api/errors'
import type { Book, ManagedBookType } from '@/types'
import ArchiveConfirmationDialog from './components/ArchiveConfirmationDialog'
import BookCard from './components/BookCard'
import BookFormDialog from './components/BookFormDialog'
import Pagination from './components/Pagination'
import { useBooksList, useDebouncedValue, useRestoreBook } from './hooks/useBooks'

type DialogState =
  | { kind: 'create' }
  | { kind: 'edit'; book: Book }
  | { kind: 'archive'; book: Book }
  | null

export default function ManagedBooksPanel({ type }: { type: ManagedBookType }) {
  const toast = useToast()
  const label = type === 'EVENT' ? 'event' : 'general'
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const archived = searchParams.get('archived') === '1'
  const pageParam = Number(searchParams.get('page'))
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1

  const [searchInput, setSearchInput] = useState(q)
  const debouncedSearch = useDebouncedValue(searchInput)
  const [dialog, setDialog] = useState<DialogState>(null)

  // Push the debounced search term into the URL (resets pagination).
  useEffect(() => {
    if (debouncedSearch.trim() === q.trim()) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        const term = debouncedSearch.trim()
        if (term) next.set('q', term)
        else next.delete('q')
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [debouncedSearch, q, setSearchParams])

  const list = useBooksList({
    type,
    search: q,
    is_archived: archived,
    ordering: '-created_at',
    page,
  })
  const restore = useRestoreBook()

  // A page past the end (e.g. after archiving the last row) → first page.
  const errorCode = getApiErrorCode(list.error)
  useEffect(() => {
    if (list.isError && page > 1 && errorCode === 'not_found') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('page')
          return next
        },
        { replace: true },
      )
    }
  }, [list.isError, errorCode, page, setSearchParams])

  function updateParams(mutate: (params: URLSearchParams) => void) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      mutate(next)
      return next
    })
  }

  async function handleRestore(book: Book) {
    try {
      await restore.mutateAsync(book.id)
      toast.success(`“${book.name}” restored.`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not restore this book. Please try again.'))
    }
  }

  const books = list.data?.results ?? []
  const searching = q.trim().length > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="books-search" className="mb-1 block text-sm font-medium text-text-primary">
            Search {label} books
          </label>
          <input
            id="books-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or description"
            className={inputClass}
          />
        </div>
        <label className="flex min-h-touch items-center gap-2 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) =>
              updateParams((params) => {
                if (e.target.checked) params.set('archived', '1')
                else params.delete('archived')
                params.delete('page')
              })
            }
            className="h-5 w-5 rounded border-border text-brand-700 focus:ring-2 focus:ring-brand-700"
          />
          Show archived
        </label>
        <button type="button" className={primaryButton} onClick={() => setDialog({ kind: 'create' })}>
          Create {label} book
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-text-primary">
          {archived ? `Archived ${label} books` : `${type === 'EVENT' ? 'Event' : 'General'} books`}
        </h2>
        {list.isFetching && !list.isPending && (
          <span className="text-caption text-text-secondary" aria-live="polite">
            Updating…
          </span>
        )}
      </div>

      {list.isPending && <LoadingSkeleton label={`Loading ${label} books`} />}

      {list.isError && (
        <ErrorState
          message={getApiErrorMessage(list.error, `Could not load ${label} books.`)}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      )}

      {list.isSuccess && books.length === 0 && searching && (
        <EmptyState
          title="No books match your search"
          description={`No ${archived ? 'archived ' : ''}${label} books match “${q}”.`}
        />
      )}

      {list.isSuccess && books.length === 0 && !searching && archived && (
        <EmptyState
          title={`No archived ${label} books`}
          description="Books you archive will appear here and can be restored."
        />
      )}

      {list.isSuccess && books.length === 0 && !searching && !archived && (
        <EmptyState
          title={`No ${label} books yet`}
          description={
            type === 'EVENT'
              ? 'Create an event book to track an occasion or trip separately.'
              : 'Create a general book for any ongoing purpose.'
          }
          action={
            <button type="button" className={primaryButton} onClick={() => setDialog({ kind: 'create' })}>
              Create {label} book
            </button>
          }
        />
      )}

      {list.isSuccess && books.length > 0 && (
        <>
          <ul className="grid gap-3 md:grid-cols-2" aria-label={`${label} books`}>
            {books.map((book) =>
              archived || book.is_archived ? (
                <BookCard
                  key={book.id}
                  book={book}
                  onRestore={handleRestore}
                  restoring={restore.isPending && restore.variables === book.id}
                />
              ) : (
                <BookCard
                  key={book.id}
                  book={book}
                  onEdit={(b) => setDialog({ kind: 'edit', book: b })}
                  onArchive={(b) => setDialog({ kind: 'archive', book: b })}
                />
              ),
            )}
          </ul>
          <Pagination
            page={page}
            hasPrevious={Boolean(list.data.previous)}
            hasNext={Boolean(list.data.next)}
            onPageChange={(p) =>
              updateParams((params) => {
                if (p <= 1) params.delete('page')
                else params.set('page', String(p))
              })
            }
          />
        </>
      )}

      {dialog?.kind === 'create' && (
        <BookFormDialog type={type} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'edit' && (
        <BookFormDialog type={type} book={dialog.book} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'archive' && (
        <ArchiveConfirmationDialog book={dialog.book} onClose={() => setDialog(null)} />
      )}
    </div>
  )
}
