/**
 * TransactionFilters — filter controls for the transaction history list.
 * Supports type, category, payment method, date range, search, and ordering.
 */

import { inputClass, secondaryButton } from '@/components/ui/styles'
import { useCategoriesList } from '@/features/transactions/hooks/useCategories'
import { usePaymentMethodsList } from '@/features/transactions/hooks/usePaymentMethods'
import type { TransactionOrdering, TransactionType } from '@/types'
import type { TransactionFilterState } from '../types'

interface TransactionFiltersProps {
  filters: TransactionFilterState
  onChange: (filters: TransactionFilterState) => void
  onClear: () => void
  hasActiveFilters: boolean
  /** Hide the From/To date inputs when the date range is fixed by the caller (Reports month scope). */
  showDates?: boolean
}

export default function TransactionFilters({
  filters,
  onChange,
  onClear,
  hasActiveFilters,
  showDates = true,
}: TransactionFiltersProps) {
  const categoriesQuery = useCategoriesList()
  const paymentMethodsQuery = usePaymentMethodsList()

  const categories = categoriesQuery.data?.results ?? []
  const paymentMethods = paymentMethodsQuery.data?.results ?? []

  return (
    <div
      aria-label="Transaction filters"
      className="space-y-3 rounded-card border border-border bg-surface p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {/* Search */}
        <div>
          <label
            htmlFor="filter-search"
            className="mb-1 block text-caption font-medium text-text-secondary"
          >
            Search notes
          </label>
          <input
            id="filter-search"
            type="search"
            placeholder="Search description…"
            value={filters.search ?? ''}
            onChange={(e) => onChange({ ...filters, search: e.target.value, page: 1 })}
            className={inputClass}
          />
        </div>

        {/* Type */}
        <div>
          <label
            htmlFor="filter-type"
            className="mb-1 block text-caption font-medium text-text-secondary"
          >
            Type
          </label>
          <select
            id="filter-type"
            value={filters.type ?? 'ALL'}
            onChange={(e) =>
              onChange({
                ...filters,
                type: e.target.value === 'ALL' ? undefined : (e.target.value as TransactionType),
                page: 1,
              })
            }
            className={inputClass}
          >
            <option value="ALL">All Types</option>
            <option value="EXPENSE">Expenses only</option>
            <option value="INCOME">Income only</option>
          </select>
        </div>

        {/* Category */}
        <div>
          <label
            htmlFor="filter-category"
            className="mb-1 block text-caption font-medium text-text-secondary"
          >
            Category
          </label>
          <select
            id="filter-category"
            value={filters.category_id ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                category_id: e.target.value || undefined,
                page: 1,
              })
            }
            className={inputClass}
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type.toLowerCase()})
              </option>
            ))}
          </select>
        </div>

        {/* Payment Method */}
        <div>
          <label
            htmlFor="filter-payment-method"
            className="mb-1 block text-caption font-medium text-text-secondary"
          >
            Payment Method
          </label>
          <select
            id="filter-payment-method"
            value={filters.payment_method_id ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                payment_method_id: e.target.value || undefined,
                page: 1,
              })
            }
            className={inputClass}
          >
            <option value="">All Payment Methods</option>
            {paymentMethods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date From */}
        {showDates && (
        <div>
          <label
            htmlFor="filter-date-from"
            className="mb-1 block text-caption font-medium text-text-secondary"
          >
            From Date
          </label>
          <input
            id="filter-date-from"
            type="date"
            value={filters.date_from ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                date_from: e.target.value || undefined,
                page: 1,
              })
            }
            className={inputClass}
          />
        </div>
        )}

        {/* Date To */}
        {showDates && (
        <div>
          <label
            htmlFor="filter-date-to"
            className="mb-1 block text-caption font-medium text-text-secondary"
          >
            To Date
          </label>
          <input
            id="filter-date-to"
            type="date"
            value={filters.date_to ?? ''}
            onChange={(e) =>
              onChange({
                ...filters,
                date_to: e.target.value || undefined,
                page: 1,
              })
            }
            className={inputClass}
          />
        </div>
        )}

        {/* Ordering */}
        <div>
          <label
            htmlFor="filter-ordering"
            className="mb-1 block text-caption font-medium text-text-secondary"
          >
            Sort by
          </label>
          <select
            id="filter-ordering"
            value={filters.ordering ?? '-transaction_date'}
            onChange={(e) =>
              onChange({
                ...filters,
                ordering: e.target.value as TransactionOrdering,
                page: 1,
              })
            }
            className={inputClass}
          >
            <option value="-transaction_date">Date (newest first)</option>
            <option value="transaction_date">Date (oldest first)</option>
            <option value="-amount">Amount (highest first)</option>
            <option value="amount">Amount (lowest first)</option>
            <option value="-created_at">Created (newest first)</option>
            <option value="created_at">Created (oldest first)</option>
          </select>
        </div>

        {/* Clear Filters CTA */}
        {hasActiveFilters && (
          <div className="flex items-end">
            <button
              type="button"
              onClick={onClear}
              className={`${secondaryButton} w-full`}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
