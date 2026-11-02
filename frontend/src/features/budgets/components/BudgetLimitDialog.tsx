/**
 * BudgetLimitDialog — one modal for the three limit workflows:
 *   - create the monthly overall budget (no book select)
 *   - create an event budget (`bookOptions` supplies the event-book select)
 *   - edit the limit of an existing budget
 *
 * The limit may be zero (documented) but never negative.  Overspending is never
 * validated here — a budget is a soft cap.  The dialog closes only after the
 * mutation succeeds; on failure the typed input is preserved and server errors
 * are shown on the matching field or as a form-level alert.
 */

import { useId, useRef, useState, type FormEvent } from 'react'
import Modal from '@/components/ui/Modal'
import { inputClass, primaryButton, secondaryButton } from '@/components/ui/styles'
import { getApiErrorMessage, isApiError } from '@/services/api/errors'
import type { Book } from '@/types'
import { mapBudgetServerErrors, validateLimit } from '../utils'

interface BudgetLimitDialogProps {
  title: string
  submitLabel: string
  initialLimit?: string
  /** When present a required event-book select is shown. */
  bookOptions?: Book[]
  onSubmit: (values: { limit: string; bookId: string }) => Promise<void>
  onClose: () => void
}

interface Errors {
  limit?: string
  book?: string
  form?: string
}

export default function BudgetLimitDialog({
  title,
  submitLabel,
  initialLimit = '',
  bookOptions,
  onSubmit,
  onClose,
}: BudgetLimitDialogProps) {
  const uid = useId()
  const limitId = `${uid}-limit`
  const bookId = `${uid}-book`
  const [limit, setLimit] = useState(initialLimit)
  const [book, setBook] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (inFlight.current) return

    const next: Errors = {}
    const limitError = validateLimit(limit)
    if (limitError) next.limit = limitError
    if (bookOptions && !book) next.book = 'Select an event book.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    inFlight.current = true
    setSubmitting(true)
    try {
      await onSubmit({ limit: limit.trim(), bookId: book })
    } catch (err) {
      if (isApiError(err) && err.error.code === 'validation_error') {
        const mapped = mapBudgetServerErrors(err.error.details)
        const hasAny = Object.keys(mapped).length > 0
        setErrors({
          limit: mapped.total_limit,
          book: mapped.book_id,
          form: hasAny
            ? mapped.form
            : getApiErrorMessage(err, 'The request contains invalid fields.'),
        })
      } else {
        setErrors({ form: getApiErrorMessage(err, 'Something went wrong. Please try again.') })
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose} busy={submitting}>
      <form onSubmit={handleSubmit} noValidate aria-label={title}>
        {errors.form && (
          <div
            role="alert"
            className="mb-4 rounded-input border border-danger-text bg-danger-bg px-4 py-3 text-sm text-danger-text"
          >
            {errors.form}
          </div>
        )}

        {bookOptions && (
          <div className="mb-4">
            <label htmlFor={bookId} className="mb-1 block text-caption font-medium text-text-secondary">
              Event book <span className="text-danger-text">*</span>
            </label>
            <select
              id={bookId}
              value={book}
              disabled={submitting}
              onChange={(e) => {
                setBook(e.target.value)
                setErrors((prev) => ({ ...prev, book: undefined }))
              }}
              className={inputClass}
              aria-invalid={Boolean(errors.book)}
              aria-describedby={errors.book ? `${bookId}-error` : undefined}
              data-autofocus
            >
              <option value="">Select an event book</option>
              {bookOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {errors.book && (
              <p id={`${bookId}-error`} className="mt-1 text-xs text-danger-text">
                {errors.book}
              </p>
            )}
          </div>
        )}

        <div>
          <label htmlFor={limitId} className="mb-1 block text-caption font-medium text-text-secondary">
            Total limit (₹) <span className="text-danger-text">*</span>
          </label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-sm font-medium text-text-secondary"
            >
              ₹
            </span>
            <input
              id={limitId}
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={limit}
              disabled={submitting}
              onChange={(e) => {
                setLimit(e.target.value)
                setErrors((prev) => ({ ...prev, limit: undefined }))
              }}
              className={`${inputClass} pl-8 tabular-nums ${
                errors.limit ? 'border-danger-text focus:border-danger-text focus:ring-danger-text' : ''
              }`}
              aria-invalid={Boolean(errors.limit)}
              aria-describedby={`${limitId}-hint${errors.limit ? ` ${limitId}-error` : ''}`}
              data-autofocus={bookOptions ? undefined : true}
            />
          </div>
          <p id={`${limitId}-hint`} className="mt-1 text-xs text-text-secondary">
            Zero is allowed. Spending above the limit is never blocked — it is shown as over budget.
          </p>
          {errors.limit && (
            <p id={`${limitId}-error`} className="mt-1 text-xs text-danger-text">
              {errors.limit}
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={secondaryButton} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className={primaryButton} disabled={submitting}>
            {submitting ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
