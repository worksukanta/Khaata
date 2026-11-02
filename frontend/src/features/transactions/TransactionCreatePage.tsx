/**
 * TransactionCreatePage — UX-06 (`/transactions/new`).
 * Quick transaction entry with Income/Expense toggle, decimal amount,
 * book selection, type-matched category, and payment method.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LoadingSkeleton } from '@/components/ui/StateViews'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/features/auth/AuthContext'
import { getCurrentYearMonth } from '@/features/books/utils'
import { useEnsureMonthlyBook } from '@/features/books/hooks/useBooks'
import { useCreateTransaction } from '@/features/transactions/hooks/useTransactions'
import {
  emptyTransactionFormValues,
  toCreateTransactionPayload,
} from '@/features/transactions/utils'
import { getApiErrorMessage } from '@/services/api/errors'
import TransactionForm from './components/TransactionForm'
import type { TransactionFormValues } from './types'

export default function TransactionCreatePage() {
  const [searchParams] = useSearchParams()
  const bookIdParam = searchParams.get('bookId') ?? ''
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()

  const { year: currentYear, month: currentMonth } = useMemo(
    () => getCurrentYearMonth(user?.timezone),
    [user?.timezone],
  )

  // Ensure current monthly book so it's ready if no bookId param is given
  const ensureMonthlyQuery = useEnsureMonthlyBook(currentYear, currentMonth)
  const defaultBookId = bookIdParam || ensureMonthlyQuery.data?.book.id || ''

  const [formValues, setFormValues] = useState<TransactionFormValues>(() =>
    emptyTransactionFormValues(defaultBookId, user?.timezone),
  )

  useEffect(() => {
    if (defaultBookId && !formValues.book_id) {
      setFormValues((prev) => ({ ...prev, book_id: defaultBookId }))
    }
  }, [defaultBookId, formValues.book_id])

  const createMutation = useCreateTransaction()

  async function handleSubmit(values: TransactionFormValues) {
    try {
      const payload = toCreateTransactionPayload(values)
      const txn = await createMutation.mutateAsync(payload)
      toast.success('Transaction added.')
      navigate(`/books/${txn.book_id}`)
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, 'Could not add transaction.')
      toast.error(msg)
      throw err // rethrow for form to capture field-level details
    }
  }

  function handleCancel() {
    if (bookIdParam) {
      navigate(`/books/${bookIdParam}`)
    } else {
      navigate(-1)
    }
  }

  if (ensureMonthlyQuery.isPending && !bookIdParam) {
    return <LoadingSkeleton label="Preparing transaction form" rows={3} />
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={bookIdParam ? `/books/${bookIdParam}` : '/books'}
          className="inline-flex min-h-touch items-center text-sm font-medium text-brand-700 hover:underline focus:outline-none focus:ring-2 focus:ring-brand-700"
        >
          ← Back
        </Link>
      </div>

      <div className="text-center sm:text-left">
        <h1 className="text-title-mobile font-bold text-text-primary lg:text-title-desktop">
          Add Transaction
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          Record a new income or expense in your books.
        </p>
      </div>

      <TransactionForm
        initialValues={formValues}
        onSubmit={handleSubmit}
        onCancel={handleCancel}
        isBusy={createMutation.isPending}
      />
    </div>
  )
}
