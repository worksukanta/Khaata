/**
 * TransactionForm — accessible, responsive form for creating and editing transactions.
 * Supports Income/Expense toggle, positive decimal amount, book selection,
 * type-matched category selection, payment method selection, and description.
 */

import { useMemo, useState, type FormEvent } from 'react'
import { inputClass, primaryButton, secondaryButton } from '@/components/ui/styles'
import { useBooksList } from '@/features/books/hooks/useBooks'
import { useCategoriesList } from '@/features/transactions/hooks/useCategories'
import { usePaymentMethodsList } from '@/features/transactions/hooks/usePaymentMethods'
import {
  mapTransactionServerErrors,
  validateTransactionForm,
} from '@/features/transactions/utils'
import type { Book, Category, PaymentMethod, TransactionType } from '@/types'
import type { TransactionFormErrors, TransactionFormValues } from '../types'

interface TransactionFormProps {
  initialValues: TransactionFormValues
  onSubmit: (values: TransactionFormValues) => Promise<void>
  onCancel?: () => void
  isEditing?: boolean
  isArchivedBook?: boolean
  isBusy?: boolean
  historicalCategory?: Pick<Category, 'id' | 'name' | 'type'> | null
  historicalPaymentMethod?: Pick<PaymentMethod, 'id' | 'name'> | null
  currentBook?: Book | null
}

export default function TransactionForm({
  initialValues,
  onSubmit,
  onCancel,
  isEditing = false,
  isArchivedBook = false,
  isBusy = false,
  historicalCategory = null,
  historicalPaymentMethod = null,
  currentBook = null,
}: TransactionFormProps) {
  const [values, setValues] = useState<TransactionFormValues>(initialValues)
  const [clientErrors, setClientErrors] = useState<TransactionFormErrors>({})
  const [serverErrors, setServerErrors] = useState<TransactionFormErrors>({})

  // Load books, categories, and payment methods
  const booksQuery = useBooksList({ is_archived: false })
  const categoriesQuery = useCategoriesList({ is_active: true })
  const paymentMethodsQuery = usePaymentMethodsList({ is_active: true })

  const availableBooks = useMemo(
    () => booksQuery.data?.results ?? [],
    [booksQuery.data?.results],
  )
  const activeCategories = useMemo(
    () => categoriesQuery.data?.results ?? [],
    [categoriesQuery.data?.results],
  )
  const activePaymentMethods = useMemo(
    () => paymentMethodsQuery.data?.results ?? [],
    [paymentMethodsQuery.data?.results],
  )

  // Ensure currentBook or values.book_id is always in select options even if query is loading
  const allBookOptions = useMemo(() => {
    const list = [...availableBooks]
    if (currentBook && !list.some((b) => b.id === currentBook.id)) {
      list.unshift(currentBook)
    }
    if (values.book_id && !list.some((b) => b.id === values.book_id)) {
      list.push({
        id: values.book_id,
        name: currentBook?.name ?? 'Selected book',
        type: currentBook?.type ?? 'MONTHLY',
        opening_balance: '0.00',
        is_archived: currentBook?.is_archived ?? false,
        created_at: '',
        updated_at: '',
      })
    }
    return list
  }, [availableBooks, currentBook, values.book_id])

  // Filter categories matching current transaction type + preserve historical inactive category
  const visibleCategories = useMemo(() => {
    const list = activeCategories.filter((c) => c.type === values.type)
    if (
      historicalCategory &&
      historicalCategory.type === values.type &&
      !list.some((c) => c.id === historicalCategory.id)
    ) {
      list.unshift({
        id: historicalCategory.id,
        name: `${historicalCategory.name} (Inactive)`,
        type: historicalCategory.type,
        is_active: false,
      })
    }
    if (values.category_id && !list.some((c) => c.id === values.category_id)) {
      list.push({
        id: values.category_id,
        name: historicalCategory?.name ?? 'Selected category',
        type: values.type,
        is_active: true,
      })
    }
    return list
  }, [activeCategories, values.type, values.category_id, historicalCategory])

  // Payment methods + preserve historical inactive payment method
  const visiblePaymentMethods = useMemo(() => {
    const list = [...activePaymentMethods]
    if (
      historicalPaymentMethod &&
      !list.some((p) => p.id === historicalPaymentMethod.id)
    ) {
      list.unshift({
        id: historicalPaymentMethod.id,
        name: `${historicalPaymentMethod.name} (Inactive)`,
        is_active: false,
      })
    }
    if (values.payment_method_id && !list.some((p) => p.id === values.payment_method_id)) {
      list.push({
        id: values.payment_method_id,
        name: historicalPaymentMethod?.name ?? 'Selected payment method',
        is_active: true,
      })
    }
    return list
  }, [activePaymentMethods, values.payment_method_id, historicalPaymentMethod])

  const errors = { ...clientErrors, ...serverErrors }

  // Check if monthly reassignment note applies on edit
  const showMonthlyMoveNotice = useMemo(() => {
    if (!isEditing || !currentBook || currentBook.type !== 'MONTHLY') return false
    if (!values.transaction_date || !currentBook.year || !currentBook.month) return false
    const match = /^(\d{4})-(\d{2})/.exec(values.transaction_date)
    if (!match) return false
    const dateYear = Number(match[1])
    const dateMonth = Number(match[2])
    return dateYear !== currentBook.year || dateMonth !== currentBook.month
  }, [isEditing, currentBook, values.transaction_date])

  function handleTypeChange(newType: TransactionType) {
    if (values.type === newType) return
    setValues((prev) => {
      // Clear category if its type doesn't match new type
      const currentCat = activeCategories.find((c) => c.id === prev.category_id)
      const keepCategory = currentCat && currentCat.type === newType
      return {
        ...prev,
        type: newType,
        category_id: keepCategory ? prev.category_id : '',
      }
    })
    setClientErrors((prev) => ({ ...prev, category_id: undefined }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (isArchivedBook || isBusy) return

    setClientErrors({})
    setServerErrors({})

    const validation = validateTransactionForm(
      values,
      availableBooks,
      visibleCategories,
    )

    if (Object.keys(validation).length > 0) {
      setClientErrors(validation)
      return
    }

    try {
      await onSubmit(values)
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'error' in err &&
        typeof (err as { error: { details?: Record<string, string[]> } }).error.details ===
          'object'
      ) {
        const details = (
          err as { error: { details?: Record<string, string[]> } }
        ).error.details
        setServerErrors(mapTransactionServerErrors(details))
      }
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto w-full max-w-[520px] space-y-5 rounded-card border border-border bg-surface p-4 sm:p-6"
      noValidate
    >
      {errors.form && (
        <div
          role="alert"
          className="rounded-input border border-danger-text bg-danger-bg p-3 text-sm text-danger-text"
        >
          {errors.form}
        </div>
      )}

      {isArchivedBook && (
        <div
          role="status"
          className="rounded-input border border-warning-text bg-warning-bg p-3 text-sm text-warning-text"
        >
          This transaction belongs to an archived book and cannot be edited.
        </div>
      )}

      {/* Transaction Type Segmented Toggle */}
      <div>
        <label className="mb-1.5 block text-caption font-medium text-text-secondary">
          Transaction Type
        </label>
        <div
          role="radiogroup"
          aria-label="Transaction Type"
          className="grid grid-cols-2 gap-2 rounded-input bg-gray-100 p-1"
        >
          <button
            type="button"
            role="radio"
            aria-checked={values.type === 'EXPENSE'}
            disabled={isArchivedBook || isBusy}
            onClick={() => handleTypeChange('EXPENSE')}
            className={`min-h-touch rounded-input py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-700 ${
              values.type === 'EXPENSE'
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Expense
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={values.type === 'INCOME'}
            disabled={isArchivedBook || isBusy}
            onClick={() => handleTypeChange('INCOME')}
            className={`min-h-touch rounded-input py-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-700 ${
              values.type === 'INCOME'
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Income
          </button>
        </div>
      </div>

      {/* Amount Input */}
      <div>
        <label
          htmlFor="transaction-amount"
          className="mb-1 block text-caption font-medium text-text-secondary"
        >
          Amount (₹) <span className="text-danger-text">*</span>
        </label>
        <div className="relative">
          <span
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-medium text-text-secondary"
            aria-hidden="true"
          >
            ₹
          </span>
          <input
            id="transaction-amount"
            name="amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            disabled={isArchivedBook || isBusy}
            value={values.amount}
            onChange={(e) => {
              setValues((prev) => ({ ...prev, amount: e.target.value }))
              setClientErrors((prev) => ({ ...prev, amount: undefined }))
            }}
            className={`${inputClass} pl-8 tabular-nums ${
              errors.amount ? 'border-danger-text focus:border-danger-text focus:ring-danger-text' : ''
            }`}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? 'amount-error' : undefined}
          />
        </div>
        {errors.amount && (
          <p id="amount-error" className="mt-1 text-xs text-danger-text">
            {errors.amount}
          </p>
        )}
      </div>

      {/* Date Input */}
      <div>
        <label
          htmlFor="transaction-date"
          className="mb-1 block text-caption font-medium text-text-secondary"
        >
          Date <span className="text-danger-text">*</span>
        </label>
        <input
          id="transaction-date"
          name="transaction_date"
          type="date"
          disabled={isArchivedBook || isBusy}
          value={values.transaction_date}
          onChange={(e) => {
            setValues((prev) => ({ ...prev, transaction_date: e.target.value }))
            setClientErrors((prev) => ({ ...prev, transaction_date: undefined }))
          }}
          className={`${inputClass} ${
            errors.transaction_date
              ? 'border-danger-text focus:border-danger-text focus:ring-danger-text'
              : ''
          }`}
          aria-invalid={Boolean(errors.transaction_date)}
          aria-describedby={errors.transaction_date ? 'date-error' : undefined}
        />
        {errors.transaction_date && (
          <p id="date-error" className="mt-1 text-xs text-danger-text">
            {errors.transaction_date}
          </p>
        )}
        {showMonthlyMoveNotice && (
          <p className="mt-1.5 rounded-input bg-brand-50 p-2 text-xs text-brand-700">
            Note: Changing the month on this monthly transaction will automatically move it to the corresponding monthly book upon saving.
          </p>
        )}
      </div>

      {/* Book Selection */}
      <div>
        <label
          htmlFor="transaction-book"
          className="mb-1 block text-caption font-medium text-text-secondary"
        >
          Book <span className="text-danger-text">*</span>
        </label>
        <select
          id="transaction-book"
          name="book_id"
          disabled={isArchivedBook || isBusy}
          value={values.book_id}
          onChange={(e) => {
            setValues((prev) => ({ ...prev, book_id: e.target.value }))
            setClientErrors((prev) => ({ ...prev, book_id: undefined }))
          }}
          className={`${inputClass} ${
            errors.book_id ? 'border-danger-text focus:border-danger-text focus:ring-danger-text' : ''
          }`}
          aria-invalid={Boolean(errors.book_id)}
          aria-describedby={errors.book_id ? 'book-error' : undefined}
        >
          <option value="">Select a book</option>
          {allBookOptions.map((b) => (
            <option key={b.id} value={b.id} disabled={b.is_archived}>
              {b.name} {b.is_archived ? '(Archived)' : `(${b.type.toLowerCase()})`}
            </option>
          ))}
        </select>
        {errors.book_id && (
          <p id="book-error" className="mt-1 text-xs text-danger-text">
            {errors.book_id}
          </p>
        )}
      </div>

      {/* Category Selection */}
      <div>
        <label
          htmlFor="transaction-category"
          className="mb-1 block text-caption font-medium text-text-secondary"
        >
          Category (optional)
        </label>
        <select
          id="transaction-category"
          name="category_id"
          disabled={isArchivedBook || isBusy}
          value={values.category_id}
          onChange={(e) => {
            setValues((prev) => ({ ...prev, category_id: e.target.value }))
            setClientErrors((prev) => ({ ...prev, category_id: undefined }))
          }}
          className={`${inputClass} ${
            errors.category_id
              ? 'border-danger-text focus:border-danger-text focus:ring-danger-text'
              : ''
          }`}
          aria-invalid={Boolean(errors.category_id)}
          aria-describedby={errors.category_id ? 'category-error' : undefined}
        >
          <option value="">No category</option>
          {visibleCategories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.category_id && (
          <p id="category-error" className="mt-1 text-xs text-danger-text">
            {errors.category_id}
          </p>
        )}
      </div>

      {/* Payment Method Selection */}
      <div>
        <label
          htmlFor="transaction-payment-method"
          className="mb-1 block text-caption font-medium text-text-secondary"
        >
          Payment Method (optional)
        </label>
        <select
          id="transaction-payment-method"
          name="payment_method_id"
          disabled={isArchivedBook || isBusy}
          value={values.payment_method_id}
          onChange={(e) => {
            setValues((prev) => ({ ...prev, payment_method_id: e.target.value }))
            setClientErrors((prev) => ({ ...prev, payment_method_id: undefined }))
          }}
          className={`${inputClass} ${
            errors.payment_method_id
              ? 'border-danger-text focus:border-danger-text focus:ring-danger-text'
              : ''
          }`}
          aria-invalid={Boolean(errors.payment_method_id)}
          aria-describedby={errors.payment_method_id ? 'payment-method-error' : undefined}
        >
          <option value="">No payment method</option>
          {visiblePaymentMethods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {errors.payment_method_id && (
          <p id="payment-method-error" className="mt-1 text-xs text-danger-text">
            {errors.payment_method_id}
          </p>
        )}
      </div>

      {/* Description Textarea */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label
            htmlFor="transaction-description"
            className="text-caption font-medium text-text-secondary"
          >
            Description / Notes (optional)
          </label>
          <span className="text-xs text-text-secondary">
            {values.description.length}/500
          </span>
        </div>
        <textarea
          id="transaction-description"
          name="description"
          rows={3}
          maxLength={500}
          disabled={isArchivedBook || isBusy}
          value={values.description}
          onChange={(e) => {
            setValues((prev) => ({ ...prev, description: e.target.value }))
            setClientErrors((prev) => ({ ...prev, description: undefined }))
          }}
          placeholder="What was this for?"
          className={`${inputClass} resize-y ${
            errors.description
              ? 'border-danger-text focus:border-danger-text focus:ring-danger-text'
              : ''
          }`}
          aria-invalid={Boolean(errors.description)}
          aria-describedby={errors.description ? 'description-error' : undefined}
        />
        {errors.description && (
          <p id="description-error" className="mt-1 text-xs text-danger-text">
            {errors.description}
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        {onCancel && (
          <button
            type="button"
            className={secondaryButton}
            onClick={onCancel}
            disabled={isBusy}
          >
            Cancel
          </button>
        )}
        {!isArchivedBook && (
          <button
            type="submit"
            className={primaryButton}
            disabled={isBusy}
          >
            {isBusy ? 'Saving…' : isEditing ? 'Save changes' : 'Add transaction'}
          </button>
        )}
      </div>
    </form>
  )
}
