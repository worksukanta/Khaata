/**
 * BookFormDialog — modal create/edit flow for EVENT and GENERAL books.
 *
 * Closes only after the mutation succeeds; failures are surfaced by BookForm
 * with the user's input preserved.
 */

import Modal from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import type { Book, ManagedBookType } from '@/types'
import BookForm from './BookForm'
import { useCreateBook, useUpdateBook } from '../hooks/useBooks'
import { toCreatePayload, toUpdatePayload, valuesFromBook } from '../utils'

interface BookFormDialogProps {
  type: ManagedBookType
  /** Present → edit mode; absent → create mode. */
  book?: Book
  onClose: () => void
}

export default function BookFormDialog({ type, book, onClose }: BookFormDialogProps) {
  const toast = useToast()
  const create = useCreateBook()
  const update = useUpdateBook()
  const label = type === 'EVENT' ? 'event' : 'general'
  const busy = create.isPending || update.isPending

  return (
    <Modal
      title={book ? `Edit ${label} book` : `Create ${label} book`}
      onClose={onClose}
      busy={busy}
    >
      <BookForm
        type={type}
        initialValues={book ? valuesFromBook(book) : undefined}
        submitLabel={book ? 'Save changes' : `Create ${label} book`}
        onCancel={onClose}
        onSubmit={async (values) => {
          if (book) {
            await update.mutateAsync({ id: book.id, payload: toUpdatePayload(values, type) })
            toast.success('Book updated.')
          } else {
            await create.mutateAsync(toCreatePayload(values, type))
            toast.success('Book created.')
          }
          onClose()
        }}
      />
    </Modal>
  )
}
