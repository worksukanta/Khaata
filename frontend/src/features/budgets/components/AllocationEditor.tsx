/**
 * AllocationEditor — atomic full replacement of a budget's category allocations
 * (PUT /budgets/{id}/allocations/).
 *
 * Rules enforced client-side (server is authoritative): each category once, only
 * active expense categories as new selections, amounts ≥ 0 with ≤ 2 dp, and the
 * allocation total may not exceed the limit (equal is allowed).  The live total
 * and unallocated amount use exact integer-cent arithmetic.  A failed save keeps
 * every entered value; success resets the editor to the persisted state.
 */

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { inputClass, primaryButton, secondaryButton } from '@/components/ui/styles'
import { formatMoney } from '@/features/books/utils'
import { getApiErrorMessage, isApiError } from '@/services/api/errors'
import type { Budget, Category } from '@/types'
import type { AllocationRow, AllocationRowErrors } from '../types'
import {
  allocationsSignature,
  fromCents,
  mapAllocationServerErrors,
  newAllocationRow,
  normalizeAmount,
  rowsFromBudget,
  sumMoney,
  toAllocationInputs,
  toCents,
  validateAllocations,
  validateNonNegativeAmount,
} from '../utils'

interface AllocationEditorProps {
  budget: Budget
  /** Active EXPENSE categories available for new selections. */
  categories: Category[]
  onSave: (allocations: ReturnType<typeof toAllocationInputs>) => Promise<void>
}

export default function AllocationEditor({ budget, categories, onSave }: AllocationEditorProps) {
  const signature = allocationsSignature(budget)
  const [rows, setRows] = useState<AllocationRow[]>(() => rowsFromBudget(budget))
  const [rowErrors, setRowErrors] = useState<Record<number, AllocationRowErrors>>({})
  const [formError, setFormError] = useState<string | undefined>()
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef(false)

  // Re-sync with the persisted allocations after a successful save / refetch.
  const lastSignature = useRef(signature)
  useEffect(() => {
    if (lastSignature.current !== signature) {
      lastSignature.current = signature
      setRows(rowsFromBudget(budget))
      setRowErrors({})
      setFormError(undefined)
    }
  }, [signature, budget])

  const inactiveIds = useMemo(
    () =>
      new Set(budget.allocations.filter((a) => !a.category.is_active).map((a) => a.category.id)),
    [budget.allocations],
  )

  // Options = active expense categories + categories of existing (possibly inactive) allocations.
  const options = useMemo(() => {
    const list = categories.map((c) => ({ id: c.id, name: c.name }))
    for (const a of budget.allocations) {
      if (!list.some((o) => o.id === a.category.id)) {
        list.push({
          id: a.category.id,
          name: a.category.is_active ? a.category.name : `${a.category.name} (Inactive)`,
        })
      }
    }
    return list.sort((x, y) => x.name.localeCompare(y.name))
  }, [categories, budget.allocations])

  // Live total over rows whose amount currently parses; invalid rows are reported on submit.
  const liveTotal = useMemo(() => {
    const valid = rows
      .filter((r) => validateNonNegativeAmount(r.amount) === undefined)
      .map((r) => normalizeAmount(r.amount))
    return sumMoney(valid) ?? '0.00'
  }, [rows])
  const limitCents = toCents(budget.total_limit)
  const totalCents = toCents(liveTotal)
  const overAllocated = limitCents !== null && totalCents !== null && totalCents > limitCents
  const liveUnallocated =
    limitCents !== null && totalCents !== null ? fromCents(limitCents - totalCents) : null

  function updateRow(index: number, patch: Partial<AllocationRow>) {
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)))
    setRowErrors((current) => {
      const { [index]: _removed, ...rest } = current
      void _removed
      return rest
    })
    setFormError(undefined)
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index))
    setRowErrors({})
    setFormError(undefined)
  }

  function usedCategoryIds(exceptIndex: number): Set<string> {
    return new Set(rows.filter((_, i) => i !== exceptIndex).map((r) => r.category_id))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (inFlight.current) return

    const result = validateAllocations(rows, budget.total_limit, inactiveIds)
    setRowErrors(result.rowErrors)
    setFormError(result.form)
    if (Object.keys(result.rowErrors).length > 0 || result.form) return

    inFlight.current = true
    setSubmitting(true)
    try {
      await onSave(toAllocationInputs(rows))
    } catch (err) {
      if (isApiError(err) && err.error.code === 'validation_error') {
        const mapped = mapAllocationServerErrors(err.error.details)
        setRowErrors(mapped.rows)
        setFormError(
          mapped.form ??
            (Object.keys(mapped.rows).length === 0
              ? getApiErrorMessage(err, 'The request contains invalid fields.')
              : undefined),
        )
      } else {
        setFormError(getApiErrorMessage(err, 'Could not save allocations. Please try again.'))
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  const noCategoriesAvailable = options.length === 0

  return (
    <section
      aria-labelledby="allocation-editor-heading"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="allocation-editor-heading" className="text-base font-semibold text-text-primary">
        Edit allocations
      </h2>
      <p className="mt-1 text-sm text-text-secondary">
        Saving replaces all allocations at once. The total cannot exceed the budget limit of{' '}
        {formatMoney(budget.total_limit)}.
      </p>

      <form onSubmit={handleSubmit} noValidate aria-label="Category allocations" className="mt-4">
        {formError && (
          <div
            role="alert"
            className="mb-4 rounded-input border border-danger-text bg-danger-bg px-4 py-3 text-sm text-danger-text"
          >
            {formError}
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-sm text-text-secondary">
            No allocations. Add a category, or save to keep none.
          </p>
        ) : (
          <ul className="space-y-4">
            {rows.map((row, index) => {
              const errors = rowErrors[index] ?? {}
              const used = usedCategoryIds(index)
              return (
                <li
                  key={row.key}
                  data-testid="allocation-row"
                  className="rounded-input border border-border p-3"
                >
                  <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-start">
                    <div>
                      <label
                        htmlFor={`alloc-cat-${row.key}`}
                        className="mb-1 block text-caption font-medium text-text-secondary"
                      >
                        Category {index + 1}
                      </label>
                      <select
                        id={`alloc-cat-${row.key}`}
                        value={row.category_id}
                        disabled={submitting}
                        onChange={(e) => updateRow(index, { category_id: e.target.value })}
                        className={inputClass}
                        aria-invalid={Boolean(errors.category)}
                        aria-describedby={errors.category ? `alloc-cat-${row.key}-err` : undefined}
                      >
                        <option value="">Select a category</option>
                        {options.map((o) => (
                          <option key={o.id} value={o.id} disabled={used.has(o.id)}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                      {errors.category && (
                        <p id={`alloc-cat-${row.key}-err`} className="mt-1 text-xs text-danger-text">
                          {errors.category}
                        </p>
                      )}
                    </div>

                    <div>
                      <label
                        htmlFor={`alloc-amt-${row.key}`}
                        className="mb-1 block text-caption font-medium text-text-secondary"
                      >
                        Amount {index + 1} (₹)
                      </label>
                      <input
                        id={`alloc-amt-${row.key}`}
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={row.amount}
                        disabled={submitting}
                        onChange={(e) => updateRow(index, { amount: e.target.value })}
                        className={`${inputClass} tabular-nums ${
                          errors.amount
                            ? 'border-danger-text focus:border-danger-text focus:ring-danger-text'
                            : ''
                        }`}
                        aria-invalid={Boolean(errors.amount)}
                        aria-describedby={errors.amount ? `alloc-amt-${row.key}-err` : undefined}
                      />
                      {errors.amount && (
                        <p id={`alloc-amt-${row.key}-err`} className="mt-1 text-xs text-danger-text">
                          {errors.amount}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      className={`${secondaryButton} sm:mt-6`}
                      disabled={submitting}
                      aria-label={`Remove allocation ${index + 1}`}
                      onClick={() => removeRow(index)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={secondaryButton}
            disabled={submitting || noCategoriesAvailable}
            onClick={() => setRows((current) => [...current, newAllocationRow()])}
          >
            Add category
          </button>
          {noCategoriesAvailable && (
            <span className="text-sm text-text-secondary">No active expense categories exist.</span>
          )}
        </div>

        <dl
          className="mt-4 grid gap-3 rounded-input bg-background p-3 text-sm sm:grid-cols-2"
          aria-live="polite"
        >
          <div>
            <dt className="text-caption text-text-secondary">Allocation total</dt>
            <dd className="font-semibold tabular-nums text-text-primary" data-testid="live-total">
              {formatMoney(liveTotal)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Unallocated</dt>
            <dd
              className={`font-semibold tabular-nums ${
                overAllocated ? 'text-danger-text' : 'text-text-primary'
              }`}
              data-testid="live-unallocated"
            >
              {liveUnallocated !== null ? formatMoney(liveUnallocated) : '—'}
            </dd>
          </div>
        </dl>
        {overAllocated && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger-text">
            Allocation total exceeds the budget total limit. Reduce an amount before saving.
          </p>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="submit" className={primaryButton} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save allocations'}
          </button>
        </div>
      </form>
    </section>
  )
}
