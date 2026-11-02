/**
 * Pure helpers for the Books feature (month arithmetic, formatting, form
 * validation).  No React, no network.
 */

import type { Book, CreateBookPayload, ManagedBookType, UpdateBookPayload } from '@/types'
import type { BookFormValues, BooksTab, YearMonth } from './types'

// Year bounds are those accepted by the ensure endpoint (API_CONTRACT / OpenAPI).
export const MIN_YEAR = 2000
export const MAX_YEAR = 2200

// Field limits documented in openapi.yaml (CreateBookRequest).
export const NAME_MAX_LENGTH = 150
export const DESCRIPTION_MAX_LENGTH = 5000

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_SHORT = MONTH_NAMES.map((m) => m.slice(0, 3))

export const TAB_TO_TYPE: Record<Exclude<BooksTab, 'monthly'>, ManagedBookType> = {
  event: 'EVENT',
  general: 'GENERAL',
}

// ---------------------------------------------------------------------------
// Month arithmetic
// ---------------------------------------------------------------------------

/** Current calendar year/month in the given IANA timezone (falls back to local time). */
export function getCurrentYearMonth(timezone?: string, now: Date = new Date()): YearMonth {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
    }).formatToParts(now)
    const year = Number(parts.find((p) => p.type === 'year')?.value)
    const month = Number(parts.find((p) => p.type === 'month')?.value)
    if (Number.isInteger(year) && Number.isInteger(month)) return { year, month }
  } catch {
    // invalid timezone identifier — fall through to local time
  }
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

/** Move by `delta` months, rolling the year (Dec→Jan, Jan→Dec). */
export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

export function isWithinSupportedRange({ year, month }: YearMonth): boolean {
  return year >= MIN_YEAR && year <= MAX_YEAR && month >= 1 && month <= 12
}

/** Parse `year`/`month` URL params; undefined when absent or out of range. */
export function parseYearMonth(
  year: string | null,
  month: string | null,
): YearMonth | undefined {
  if (year === null || month === null) return undefined
  if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) return undefined
  const parsed = { year: Number(year), month: Number(month) }
  return isWithinSupportedRange(parsed) ? parsed : undefined
}

export function monthLabel({ year, month }: YearMonth): string {
  return `${MONTH_NAMES[month - 1]} ${year}`
}

/** Sort monthly books newest-first by calendar month (display order only). */
export function sortMonthlyDesc(books: Book[]): Book[] {
  return [...books].sort(
    (a, b) => (b.year ?? 0) * 12 + (b.month ?? 0) - ((a.year ?? 0) * 12 + (a.month ?? 0)),
  )
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** `2026-10-16` → `16 Oct 2026` (no Date parsing, so no timezone shift). */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  return `${Number(match[3])} ${MONTH_SHORT[Number(match[2]) - 1]} ${match[1]}`
}

export function formatDateRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`
  if (start) return `From ${formatDate(start)}`
  if (end) return `Until ${formatDate(end)}`
  return null
}

/** Format a server decimal string with en-IN grouping, without floating point. */
export function formatMoney(amount: string): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(amount)
  if (!match) return `₹${amount}`
  const [, sign, whole, fraction = ''] = match
  const last3 = whole.slice(-3)
  const rest = whole.slice(0, -3)
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3
  return `${sign}₹${grouped}.${fraction.padEnd(2, '0')}`
}

// ---------------------------------------------------------------------------
// Form helpers
// ---------------------------------------------------------------------------

export type BookFormErrors = Partial<Record<keyof BookFormValues, string>> & {
  form?: string
}

export function emptyFormValues(): BookFormValues {
  return { name: '', description: '', start_date: '', end_date: '' }
}

export function valuesFromBook(book: Book): BookFormValues {
  return {
    name: book.name,
    description: book.description ?? '',
    start_date: book.start_date ?? '',
    end_date: book.end_date ?? '',
  }
}

export function validateBookForm(
  values: BookFormValues,
  type: ManagedBookType,
): BookFormErrors {
  const errors: BookFormErrors = {}
  const name = values.name.trim()
  if (!name) {
    errors.name = 'Name is required.'
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be at most ${NAME_MAX_LENGTH} characters.`
  }
  if (values.description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`
  }
  if (
    type === 'EVENT' &&
    values.start_date &&
    values.end_date &&
    values.end_date < values.start_date
  ) {
    errors.end_date = 'End date cannot be earlier than start date.'
  }
  return errors
}

export function toCreatePayload(
  values: BookFormValues,
  type: ManagedBookType,
): CreateBookPayload {
  const payload: CreateBookPayload = { type, name: values.name.trim() }
  const description = values.description.trim()
  if (description) payload.description = description
  if (type === 'EVENT') {
    if (values.start_date) payload.start_date = values.start_date
    if (values.end_date) payload.end_date = values.end_date
  }
  return payload
}

export function toUpdatePayload(
  values: BookFormValues,
  type: ManagedBookType,
): UpdateBookPayload {
  const payload: UpdateBookPayload = {
    name: values.name.trim(),
    description: values.description.trim(),
  }
  if (type === 'EVENT') {
    payload.start_date = values.start_date || null
    payload.end_date = values.end_date || null
  }
  return payload
}

/** Map backend `details` keys onto form fields; unknown keys go to the form-level message. */
export function mapServerErrors(
  details: Record<string, string[] | string> | undefined,
  type: ManagedBookType,
): BookFormErrors {
  const errors: BookFormErrors = {}
  if (!details) return errors
  const fields: Array<keyof BookFormValues> =
    type === 'EVENT'
      ? ['name', 'description', 'start_date', 'end_date']
      : ['name', 'description']
  const leftovers: string[] = []
  for (const [key, raw] of Object.entries(details)) {
    const text = (Array.isArray(raw) ? raw : [raw]).join(' ')
    if ((fields as string[]).includes(key)) {
      errors[key as keyof BookFormValues] = text
    } else {
      leftovers.push(text)
    }
  }
  if (leftovers.length > 0) errors.form = leftovers.join(' ')
  return errors
}
