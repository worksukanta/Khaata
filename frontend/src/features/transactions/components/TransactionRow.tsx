/**
 * TransactionRow — displays a single transaction in history list.
 * Clear income/expense distinction, category/payment method badges, and edit link.
 */

import { Link } from 'react-router-dom'
import { formatDate } from '@/features/books/utils'
import { formatTransactionAmount } from '@/features/transactions/utils'
import type { Transaction } from '@/types'

interface TransactionRowProps {
  transaction: Transaction
  readOnly?: boolean
}

export default function TransactionRow({ transaction, readOnly = false }: TransactionRowProps) {
  const { isIncome, text } = formatTransactionAmount(
    transaction.amount,
    transaction.type,
  )

  return (
    <div
      data-testid={`transaction-row-${transaction.id}`}
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3 transition-colors hover:border-gray-300 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-text-secondary">
            {formatDate(transaction.transaction_date)}
          </span>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
              isIncome
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-gray-100 text-text-secondary'
            }`}
          >
            {transaction.type === 'INCOME' ? 'Income' : 'Expense'}
          </span>
          {transaction.category && (
            <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
              {transaction.category.name}
            </span>
          )}
          {transaction.payment_method && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-text-secondary">
              {transaction.payment_method.name}
            </span>
          )}
        </div>

        {transaction.description && (
          <p className="truncate text-sm text-text-primary" title={transaction.description}>
            {transaction.description}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span
          className={`text-base font-bold tabular-nums ${
            isIncome ? 'text-emerald-700' : 'text-text-primary'
          }`}
        >
          {text}
        </span>

        <Link
          to={`/transactions/${transaction.id}/edit`}
          className="inline-flex min-h-touch items-center justify-center rounded-input border border-border px-3 py-1 text-xs font-medium text-text-secondary hover:bg-gray-50 hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-700"
          aria-label={`${readOnly ? 'View' : 'Edit'} transaction from ${formatDate(
            transaction.transaction_date,
          )} of ${text}`}
        >
          {readOnly ? 'View' : 'Edit'}
        </Link>
      </div>
    </div>
  )
}
