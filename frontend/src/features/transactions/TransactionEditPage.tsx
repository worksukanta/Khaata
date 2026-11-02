/**
 * TransactionEditPage — UX-07 (`/transactions/:id/edit`).
 * View and edit transaction details, handle soft deletion with confirmation,
 * and display archived-book read-only notices.
 */

import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ErrorState, LoadingSkeleton } from '@/components/ui/StateViews'
import { useToast } from '@/components/ui/Toast'
import { dangerButton, primaryButton } from '@/components/ui/styles'
import { useBook } from '@/features/books/hooks/useBooks'
import {
  useDeleteTransaction,
  useTransaction,
  useUpdateTransaction,
} from '@/features/transactions/hooks/useTransactions'
import {
  toUpdateTransactionPayload,
  valuesFromTransaction,
} from '@/features/transactions/utils'
import { getApiErrorCode, getApiErrorMessage } from '@/services/api/errors'
import DeleteTransactionDialog from './components/DeleteTransactionDialog'
import TransactionForm from './components/TransactionForm'
import type { TransactionFormValues } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function TransactionNotFound() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
        Transaction not found
      </h1>
      <p className="text-text-secondary">
        This transaction doesn&apos;t exist or has been deleted.
      </p>
      <Link to="/books" className={primaryButton}>
        Back to Books
      </Link>
    </div>
  )
}

export default function TransactionEditPage() {
  const { id } = useParams<{ id: string }>()
  const validId = id && UUID_RE.test(id) ? id : undefined
  const navigate = useNavigate()
  const toast = useToast()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const transactionQuery = useTransaction(validId)
  const txn = transactionQuery.data

  const bookQuery = useBook(txn?.book_id)
  const book = bookQuery.data

  const updateMutation = useUpdateTransaction()
  const deleteMutation = useDeleteTransaction()

  if (!validId) return <TransactionNotFound />
  if (transactionQuery.isPending) {
    return <LoadingSkeleton label="Loading transaction" rows={3} />
  }

  if (transactionQuery.isError) {
    if (getApiErrorCode(transactionQuery.error) === 'not_found') {
      return <TransactionNotFound />
    }
    return (
      <ErrorState
        message={getApiErrorMessage(
          transactionQuery.error,
          'Could not load this transaction.',
        )}
        onRetry={() => void transactionQuery.refetch()}
        retrying={transactionQuery.isFetching}
      />
    )
  }

  if (!txn) return <TransactionNotFound />

  const isArchivedBook = Boolean(book?.is_archived)

  async function handleSubmit(values: TransactionFormValues) {
    if (!validId) return
    try {
      const payload = toUpdateTransactionPayload(values)
      const updated = await updateMutation.mutateAsync({ id: validId, payload })
      toast.success('Transaction updated.')
      navigate(`/books/${updated.book_id}`)
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Could not update transaction.')
      toast.error(msg)
      throw err // rethrow for form to capture field-level details
    }
  }

  async function handleDeleteConfirm() {
    if (!validId || !txn) return
    setDeleteError(null)
    try {
      await deleteMutation.mutateAsync(validId)
      toast.success('Transaction deleted.')
      setShowDeleteDialog(false)
      navigate(`/books/${txn.book_id}`)
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Could not delete transaction.')
      setDeleteError(msg)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={`/books/${txn.book_id}`}
          className="inline-flex min-h-touch items-center text-sm font-medium text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-700"
        >
          ← Back to Book
        </Link>

        {!isArchivedBook && (
          <button
            type="button"
            className={dangerButton}
            onClick={() => setShowDeleteDialog(true)}
          >
            Delete
          </button>
        )}
      </div>

      <div className="text-center sm:text-left">
        <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
          {isArchivedBook ? 'Transaction Details' : 'Edit Transaction'}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {isArchivedBook
            ? 'This entry belongs to an archived book and is read-only.'
            : 'Update transaction details or delete this entry.'}
        </p>
      </div>

      <TransactionForm
        initialValues={valuesFromTransaction(txn)}
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/books/${txn.book_id}`)}
        isEditing
        isArchivedBook={isArchivedBook}
        isBusy={updateMutation.isPending}
        historicalCategory={txn.category}
        historicalPaymentMethod={txn.payment_method}
        currentBook={book}
      />

      {showDeleteDialog && (
        <DeleteTransactionDialog
          transaction={txn}
          onClose={() => setShowDeleteDialog(false)}
          onConfirm={handleDeleteConfirm}
          busy={deleteMutation.isPending}
          error={deleteError}
        />
      )}
    </div>
  )
}
