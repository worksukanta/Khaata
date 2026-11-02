/**
 * RecentTransactions — the latest (max 5) transactions of the selected month's
 * report, each with its source book label.
 *
 * The report returns `book_id` only, so names are resolved from the books list
 * (GET /books/, first page).  When a book is not on that page the row falls back
 * to a generic "Open book" link rather than guessing a name.
 */

import { Link } from 'react-router-dom'
import { formatDate } from '@/features/books/utils'
import { formatTransactionAmount } from '@/features/transactions/utils'
import type { Transaction } from '@/types'

interface RecentTransactionsProps {
  transactions: Transaction[]
  bookNames: ReadonlyMap<string, string>
}

export default function RecentTransactions({ transactions, bookNames }: RecentTransactionsProps) {
  return (
    <section
      aria-labelledby="recent-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent-heading" className="text-base font-semibold text-text-primary">
          Recent transactions
        </h2>
        <Link
          to="/books"
          className="inline-flex min-h-touch items-center text-sm font-medium text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-700"
        >
          See books
        </Link>
      </div>

      {transactions.length === 0 ? (
        <p className="mt-2 text-sm text-text-secondary">No transactions in this month yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">
          {transactions.map((txn) => {
            const { text, isIncome } = formatTransactionAmount(txn.amount, txn.type)
            const bookName = bookNames.get(txn.book_id)
            return (
              <li
                key={txn.id}
                data-testid="recent-transaction"
                className="flex items-start justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm font-medium text-text-primary">
                    {txn.description || txn.category?.name || (isIncome ? 'Income' : 'Expense')}
                  </p>
                  <p className="mt-0.5 text-caption text-text-secondary">
                    {formatDate(txn.transaction_date)} · {isIncome ? 'Income' : 'Expense'}
                    {txn.category ? ` · ${txn.category.name}` : ''} ·{' '}
                    <Link
                      to={`/books/${txn.book_id}`}
                      className="text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-700"
                    >
                      {bookName ?? 'Open book'}
                    </Link>
                  </p>
                </div>
                <span
                  className={`shrink-0 text-sm font-bold tabular-nums ${
                    isIncome ? 'text-emerald-700' : 'text-text-primary'
                  }`}
                >
                  {text}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
