/**
 * Pure helpers for the Reports feature: URL <-> state mapping, date bounds and
 * the single place where list and CSV-export filter parameters are derived (so
 * both always apply identical filters).  No React, no network.
 */

import type { YearMonth } from '@/features/books/types'
import { isWithinSupportedRange } from '@/features/books/utils'
import type { TransactionFilterState } from '@/features/transactions/types'
import type {
  TransactionExportParams,
  TransactionListParams,
  TransactionOrdering,
  TransactionType,
} from '@/types'
import type { DateScope, ReportUrlState } from './types'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export const DEFAULT_ORDERING: TransactionOrdering = '-transaction_date'

const ORDERINGS: readonly TransactionOrdering[] = [
  'transaction_date',
  '-transaction_date',
  'amount',
  '-amount',
  'created_at',
  '-created_at',
]

const PERIODS: readonly DateScope[] = ['month', 'range', 'all']

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/** True for a real calendar date in YYYY-MM-DD form. */
export function isValidIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

/** First and last calendar day of a month as ISO dates (no timezone arithmetic). */
export function monthBounds({ year, month }: YearMonth): { date_from: string; date_to: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const yyyy = String(year).padStart(4, '0')
  const mm = String(month).padStart(2, '0')
  return {
    date_from: `${yyyy}-${mm}-01`,
    date_to: `${yyyy}-${mm}-${String(lastDay).padStart(2, '0')}`,
  }
}

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------

export function defaultPeriod(bookId: string | undefined): DateScope {
  // Book reports cover every date of the book; the combined report is monthly.
  return bookId ? 'all' : 'month'
}

function validUuid(value: string | null): string | undefined {
  return value && UUID_RE.test(value) ? value : undefined
}

/** Read the Reports URL.  Unknown or malformed values are ignored, never forwarded to the API. */
export function parseReportUrl(params: URLSearchParams): ReportUrlState {
  const rawBook = params.get('bookId')
  const bookId = validUuid(rawBook)

  const yearRaw = params.get('year')
  const monthRaw = params.get('month')
  let year: number | undefined
  let month: number | undefined
  if (yearRaw !== null && monthRaw !== null && /^\d{4}$/.test(yearRaw) && /^\d{1,2}$/.test(monthRaw)) {
    const ym = { year: Number(yearRaw), month: Number(monthRaw) }
    if (isWithinSupportedRange(ym)) {
      year = ym.year
      month = ym.month
    }
  }

  const periodRaw = params.get('period') as DateScope | null
  let period: DateScope =
    periodRaw && PERIODS.includes(periodRaw) ? periodRaw : defaultPeriod(bookId)
  // A book report covers every date of the book, so "month" is not a book scope.
  if (bookId && period === 'month') period = 'all'

  const type = params.get('type')
  const ordering = params.get('ordering') as TransactionOrdering | null
  const dateFrom = params.get('dateFrom')
  const dateTo = params.get('dateTo')
  const pageRaw = params.get('page')
  const page = pageRaw && /^\d{1,6}$/.test(pageRaw) && Number(pageRaw) >= 1 ? Number(pageRaw) : 1

  const filters: TransactionFilterState = {
    type: type === 'INCOME' || type === 'EXPENSE' ? (type as TransactionType) : undefined,
    category_id: validUuid(params.get('categoryId')),
    payment_method_id: validUuid(params.get('paymentMethodId')),
    date_from: dateFrom && isValidIsoDate(dateFrom) ? dateFrom : undefined,
    date_to: dateTo && isValidIsoDate(dateTo) ? dateTo : undefined,
    search: params.get('search') ?? '',
    ordering: ordering && ORDERINGS.includes(ordering) ? ordering : DEFAULT_ORDERING,
    page,
  }

  return {
    year,
    month,
    bookId,
    bookInvalid: rawBook !== null && rawBook !== '' && bookId === undefined,
    period,
    filters,
  }
}

/** Serialise state back to a compact query string (defaults are omitted). */
export function serializeReportUrl(state: ReportUrlState): URLSearchParams {
  const p = new URLSearchParams()
  if (state.year !== undefined && state.month !== undefined) {
    p.set('year', String(state.year))
    p.set('month', String(state.month))
  }
  if (state.bookId) p.set('bookId', state.bookId)
  if (state.period !== defaultPeriod(state.bookId)) p.set('period', state.period)
  const f = state.filters
  if (f.type && f.type !== 'ALL') p.set('type', f.type)
  if (f.category_id) p.set('categoryId', f.category_id)
  if (f.payment_method_id) p.set('paymentMethodId', f.payment_method_id)
  if (state.period === 'range') {
    if (f.date_from) p.set('dateFrom', f.date_from)
    if (f.date_to) p.set('dateTo', f.date_to)
  }
  if (f.search) p.set('search', f.search)
  if (f.ordering && f.ordering !== DEFAULT_ORDERING) p.set('ordering', f.ordering)
  if (f.page && f.page > 1) p.set('page', String(f.page))
  return p
}

// ---------------------------------------------------------------------------
// Query parameters (single source for the list AND the CSV export)
// ---------------------------------------------------------------------------

/** True when the explicit range is inverted (From after To). */
export function isRangeInverted(state: ReportUrlState): boolean {
  const { date_from, date_to } = state.filters
  return state.period === 'range' && Boolean(date_from && date_to && date_from > date_to)
}

/**
 * Filters shared by GET /transactions/ and GET /exports/transactions.csv.
 * `search` is passed in so callers can supply the debounced value.
 */
export function toExportParams(
  state: ReportUrlState,
  selected: YearMonth,
  search: string | undefined,
): TransactionExportParams {
  const params: TransactionExportParams = {}
  if (state.bookId) params.book_id = state.bookId
  const f = state.filters
  if (f.type && f.type !== 'ALL') params.type = f.type
  if (f.category_id) params.category_id = f.category_id
  if (f.payment_method_id) params.payment_method_id = f.payment_method_id
  if (state.period === 'month') {
    Object.assign(params, monthBounds(selected))
  } else if (state.period === 'range') {
    if (f.date_from) params.date_from = f.date_from
    if (f.date_to) params.date_to = f.date_to
  }
  const term = search?.trim()
  if (term) params.search = term
  return params
}

/** Same filters plus the list-only `ordering` and `page`. */
export function toListParams(
  state: ReportUrlState,
  selected: YearMonth,
  search: string | undefined,
): TransactionListParams {
  return {
    ...toExportParams(state, selected, search),
    ordering: state.filters.ordering ?? DEFAULT_ORDERING,
    page: state.filters.page ?? 1,
  }
}

/** Whether any filter beyond the scope (book / period / month) is active. */
export function hasActiveFilters(state: ReportUrlState): boolean {
  const f = state.filters
  return Boolean(
    (f.type && f.type !== 'ALL') ||
      f.category_id ||
      f.payment_method_id ||
      f.search?.trim() ||
      (state.period === 'range' && (f.date_from || f.date_to)) ||
      (f.ordering && f.ordering !== DEFAULT_ORDERING),
  )
}

// ---------------------------------------------------------------------------
// Human-readable export summary
// ---------------------------------------------------------------------------

export interface SummaryLookups {
  bookName?: string
  categoryName?: string
  paymentMethodName?: string
  /** Pre-formatted month label, e.g. "October 2026". */
  monthLabel: string
  formatDate: (iso: string) => string
}

/** Scope + filter lines shown beside the export button (UI spec: "scope and filter summary"). */
export function summarizeExport(state: ReportUrlState, lookups: SummaryLookups): string[] {
  const lines: string[] = []
  lines.push(state.bookId ? `Book: ${lookups.bookName ?? 'Selected book'}` : 'Books: all books')

  const f = state.filters
  if (state.period === 'month') {
    lines.push(`Dates: ${lookups.monthLabel}`)
  } else if (state.period === 'range') {
    const from = f.date_from ? lookups.formatDate(f.date_from) : 'any date'
    const to = f.date_to ? lookups.formatDate(f.date_to) : 'any date'
    lines.push(`Dates: ${from} to ${to}`)
  } else {
    lines.push('Dates: all dates')
  }

  if (f.type && f.type !== 'ALL') lines.push(`Type: ${f.type === 'INCOME' ? 'Income' : 'Expense'}`)
  if (f.category_id) lines.push(`Category: ${lookups.categoryName ?? 'Selected category'}`)
  if (f.payment_method_id) {
    lines.push(`Payment method: ${lookups.paymentMethodName ?? 'Selected payment method'}`)
  }
  const term = f.search?.trim()
  if (term) lines.push(`Search: “${term}”`)
  return lines
}
