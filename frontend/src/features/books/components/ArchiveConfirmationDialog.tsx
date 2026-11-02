/**
 * ArchiveConfirmationDialog — confirms archiving an EVENT/GENERAL book.
 *
 * Success feedback is shown only after the server confirms.  On failure the
 * dialog stays open with the error, so the UI never falsely reports success.
 * Copy deliberately does not imply that transactions are deleted.
 */

import { useState } from 'react'
import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { dangerButton, secondaryButton } from '@/components/ui/styles'
import { getApiErrorMessage } from '@/services/api/errors'
import type { Book } from '@/types'
import { useArchiveBook } from '../hooks/useBooks'

interface ArchiveConfirmationDialogProps {
  book: Book
  onClose: () => void
}

export default function ArchiveConfirmationDialog({
  book,
  onClose,
}: ArchiveConfirmationDialogProps) {
  const toast = useToast()
  const archive = useArchiveBook()
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    if (archive.isPending) return
    setError(null)
    try {
      await archive.mutateAsync(book.id)
      toast.success(`“${book.name}” archived.`)
      onClose()
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not archive this book. Please try again.'))
    }
  }

  return (
    <Modal title="Archive this book?" onClose={onClose} busy={archive.isPending}>
      <p className="text-sm text-text-secondary">
        <strong className="text-text-primary">{book.name}</strong> will become read-only and move
        to the archived view. Its transactions are not deleted and stay in reports. You can restore
        it at any time.
      </p>
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-input border border-danger-text bg-danger-bg px-4 py-3 text-sm text-danger-text"
        >
          {error}
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          data-autofocus
          onClick={onClose}
          disabled={archive.isPending}
          className={secondaryButton}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={archive.isPending}
          aria-busy={archive.isPending}
          className={dangerButton}
        >
          {archive.isPending ? 'Archiving…' : 'Archive book'}
        </button>
      </div>
    </Modal>
  )
}
