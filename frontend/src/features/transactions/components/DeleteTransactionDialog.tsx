/**
 * DeleteTransactionDialog — confirmation dialog for transaction soft deletion.
 * Communicates that the action removes the transaction from active views and reports.
 */

import Modal from '@/components/ui/Modal'
import { dangerButton, secondaryButton } from '@/components/ui/styles'
import { formatDate } from '@/features/books/utils'
import { formatTransactionAmount } from '@/features/transactions/utils'
import type { Transaction } from '@/types'

interface DeleteTransactionDialogProps {
  transaction: Transaction
  onClose: () => void
  onConfirm: () => Promise<void>
  busy?: boolean
  error?: string | null
}

export default function DeleteTransactionDialog({
  transaction,
  onClose,
  onConfirm,
  busy = false,
  error = null,
}: DeleteTransactionDialogProps) {
  const { text, isIncome } = formatTransactionAmount(
    transaction.amount,
    transaction.type,
  )

  return (
    <Modal title="Delete transaction" onClose={onClose} busy={busy}>
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Are you sure you want to delete this {isIncome ? 'income' : 'expense'}{' '}
          entry? This will remove the transaction from active views and reports.
        </p>

        <div className="rounded-card border border-border bg-gray-50 p-3 text-sm">
          <div className="flex items-center justify-between font-medium">
            <span className="text-text-secondary">{formatDate(transaction.transaction_date)}</span>
            <span className={isIncome ? 'text-emerald-700 font-bold' : 'text-text-primary font-bold'}>
              {text}
            </span>
          </div>
          {transaction.description && (
            <p className="mt-1 text-xs text-text-secondary truncate">{transaction.description}</p>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-input border border-danger-text bg-danger-bg p-3 text-xs text-danger-text"
          >
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className={secondaryButton}
            onClick={onClose}
            disabled={busy}
            data-testid="delete-dialog-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            className={dangerButton}
            onClick={onConfirm}
            disabled={busy}
            data-autofocus
          >
            {busy ? 'Deleting…' : 'Delete transaction'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
