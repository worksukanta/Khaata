/**
 * BookForm — create/edit form for EVENT and GENERAL books.
 *
 * Fields follow the API contract: name (required), description (optional),
 * and for EVENT books optional start/end dates.
 *
 * The parent supplies `onSubmit`, which performs the mutation and rejects with
 * the normalised ApiError on failure.  The form stays mounted on failure so
 * the user's input is preserved; server field errors are mapped onto fields.
 */

import { useRef, useState, type FormEvent } from 'react'
import { isApiError } from '@/services/api/errors'
import { getApiErrorMessage } from '@/services/api/errors'
import { inputClass, primaryButton, secondaryButton } from '@/components/ui/styles'
import type { ManagedBookType } from '@/types'
import type { BookFormValues } from '../types'
import {
  DESCRIPTION_MAX_LENGTH,
  NAME_MAX_LENGTH,
  emptyFormValues,
  mapServerErrors,
  validateBookForm,
  type BookFormErrors,
} from '../utils'

interface BookFormProps {
  type: ManagedBookType
  initialValues?: BookFormValues
  submitLabel: string
  onSubmit: (values: BookFormValues) => Promise<void>
  onCancel: () => void
}

export default function BookForm({
  type,
  initialValues,
  submitLabel,
  onSubmit,
  onCancel,
}: BookFormProps) {
  const [values, setValues] = useState<BookFormValues>(initialValues ?? emptyFormValues())
  const [errors, setErrors] = useState<BookFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)

  function setField<K extends keyof BookFormValues>(key: K, value: BookFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (inFlight.current) return

    const clientErrors = validateBookForm(values, type)
    setErrors(clientErrors)
    if (Object.keys(clientErrors).length > 0) return

    inFlight.current = true
    setSubmitting(true)
    try {
      await onSubmit(values)
    } catch (err) {
      if (isApiError(err) && err.error.code === 'validation_error') {
        const mapped = mapServerErrors(err.error.details, type)
        setErrors(
          Object.keys(mapped).length > 0
            ? mapped
            : { form: getApiErrorMessage(err, 'The request contains invalid fields.') },
        )
      } else {
        setErrors({ form: getApiErrorMessage(err, 'Something went wrong. Please try again.') })
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const nameError = errors.name
  const descriptionError = errors.description
  const startError = errors.start_date
  const endError = errors.end_date

  return (
    <form onSubmit={handleSubmit} noValidate aria-label={`${type === 'EVENT' ? 'Event' : 'General'} book form`}>
      {errors.form && (
        <div
          role="alert"
          className="mb-4 rounded-input border border-danger-text bg-danger-bg px-4 py-3 text-sm text-danger-text"
        >
          {errors.form}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="book-name" className="mb-1 block text-sm font-medium text-text-primary">
          Name
        </label>
        <input
          id="book-name"
          data-autofocus
          type="text"
          value={values.name}
          maxLength={NAME_MAX_LENGTH + 50}
          required
          aria-required="true"
          aria-invalid={!!nameError}
          aria-describedby={nameError ? 'book-name-error' : undefined}
          disabled={submitting}
          onChange={(e) => setField('name', e.target.value)}
          className={inputClass}
        />
        {nameError && (
          <p id="book-name-error" role="alert" className="mt-1 text-sm text-danger-text">
            {nameError}
          </p>
        )}
      </div>

      <div className="mb-4">
        <label
          htmlFor="book-description"
          className="mb-1 block text-sm font-medium text-text-primary"
        >
          Description <span className="font-normal text-text-secondary">(optional)</span>
        </label>
        <textarea
          id="book-description"
          rows={3}
          value={values.description}
          maxLength={DESCRIPTION_MAX_LENGTH + 100}
          aria-invalid={!!descriptionError}
          aria-describedby={descriptionError ? 'book-description-error' : undefined}
          disabled={submitting}
          onChange={(e) => setField('description', e.target.value)}
          className={inputClass}
        />
        {descriptionError && (
          <p id="book-description-error" role="alert" className="mt-1 text-sm text-danger-text">
            {descriptionError}
          </p>
        )}
      </div>

      {type === 'EVENT' && (
        <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="book-start-date"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              Start date <span className="font-normal text-text-secondary">(optional)</span>
            </label>
            <input
              id="book-start-date"
              type="date"
              value={values.start_date}
              aria-invalid={!!startError}
              aria-describedby={startError ? 'book-start-date-error' : undefined}
              disabled={submitting}
              onChange={(e) => setField('start_date', e.target.value)}
              className={inputClass}
            />
            {startError && (
              <p id="book-start-date-error" role="alert" className="mt-1 text-sm text-danger-text">
                {startError}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="book-end-date"
              className="mb-1 block text-sm font-medium text-text-primary"
            >
              End date <span className="font-normal text-text-secondary">(optional)</span>
            </label>
            <input
              id="book-end-date"
              type="date"
              value={values.end_date}
              aria-invalid={!!endError}
              aria-describedby={endError ? 'book-end-date-error' : undefined}
              disabled={submitting}
              onChange={(e) => setField('end_date', e.target.value)}
              className={inputClass}
            />
            {endError && (
              <p id="book-end-date-error" role="alert" className="mt-1 text-sm text-danger-text">
                {endError}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} disabled={submitting} className={secondaryButton}>
          Cancel
        </button>
        <button type="submit" disabled={submitting} aria-busy={submitting} className={primaryButton}>
          {submitting ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
