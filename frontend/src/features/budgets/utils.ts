/**
 * Pure helpers for the Budgets and Dashboard features.
 *
 * Money is handled as server decimal strings.  Where the UI has to compare or
 * add amounts (form validation and the live allocation preview only) the values
 * are converted to integer cents with BigInt, so floating point is never used.
 * Budget status, utilization and remaining values always come from the server.
 */

import type {
  AllocationInput,
  Budget,
  BudgetStatus,
  CreateBudgetPayload,
} from '@/types'
import type {
  AllocationRow,
  AllocationRowErrors,
  AllocationServerErrors,
} from './types'

export const MAX_INTEGER_DIGITS = 12

const SIGNED_MONEY_RE = /^(-?)(\d+)(?:\.(\d{1,2}))?$/

// ---------------------------------------------------------------------------
// Decimal-safe money arithmetic (integer cents)
// ---------------------------------------------------------------------------

/** Parse a decimal string (≤ 2 dp, optional leading '-') into integer cents. */
export function toCents(value: string): bigint | null {
  const match = SIGNED_MONEY_RE.exec(value.trim())
  if (!match) return null
  const cents = BigInt(match[2]) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'))
  return match[1] === '-' ? -cents : cents
}

/** Render integer cents as a two-decimal string, e.g. 12345n → "123.45". */
export function fromCents(cents: bigint): string {
  const negative = cents < 0n
  const abs = negative ? -cents : cents
  const frac = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${abs / 100n}.${frac}`
}

/** Exact sum of decimal strings; null when any value is not a valid amount. */
export function sumMoney(values: string[]): string | null {
  let total = 0n
  for (const value of values) {
    const cents = toCents(value)
    if (cents === null) return null
    total += cents
  }
  return fromCents(total)
}

/** True when the signed decimal string is strictly below zero. */
export function isNegativeMoney(value: string): boolean {
  const cents = toCents(value)
  return cents !== null && cents < 0n
}

/** Magnitude of a signed decimal string ("-100.00" → "100.00"). */
export function absMoney(value: string): string {
  return value.startsWith('-') ? value.slice(1) : value
}

/**
 * Integer percentage (0–100) of `part` relative to `whole`, for bar widths
 * only.  Computed with BigInt; a non-zero part never renders as an empty bar.
 */
export function barPercent(part: string, whole: string): number {
  const p = toCents(part)
  const w = toCents(whole)
  if (p === null || w === null || w <= 0n || p <= 0n) return 0
  const percent = Number((p * 100n) / w)
  if (percent <= 0) return 1
  return Math.min(100, percent)
}

// ---------------------------------------------------------------------------
// Money input validation (budget limits and allocation amounts; zero allowed)
// ---------------------------------------------------------------------------

/** Validate a non-negative amount (zero allowed).  Returns an error message or undefined. */
export function validateNonNegativeAmount(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return 'Amount is required.'
  if (trimmed.startsWith('-')) return 'Amount cannot be negative.'
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    return 'Enter a valid amount with at most 2 decimal places.'
  }
  if (trimmed.split('.')[0].length > MAX_INTEGER_DIGITS) return 'Amount is too large.'
  return undefined
}

/** Normalise a validated amount to the two-decimal wire format ("500" → "500.00"). */
export function normalizeAmount(value: string): string {
  const [whole, fraction = ''] = value.trim().split('.')
  return `${whole}.${fraction.padEnd(2, '0')}`
}

export function validateLimit(value: string): string | undefined {
  const error = validateNonNegativeAmount(value)
  return error ? error.replace('Amount', 'Budget limit') : undefined
}

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<BudgetStatus, string> = {
  ON_TRACK: 'On track',
  NEAR_LIMIT: 'Near limit',
  OVER_BUDGET: 'Over budget',
  UNBUDGETED_SPENDING: 'Unbudgeted spending',
  NOT_SET: 'Not set',
}

/** Text glyph paired with the label so status is never conveyed by colour alone. */
export const STATUS_GLYPH: Record<BudgetStatus, string> = {
  ON_TRACK: '✓',
  NEAR_LIMIT: '!',
  OVER_BUDGET: '▲',
  UNBUDGETED_SPENDING: '▲',
  NOT_SET: '–',
}

// ---------------------------------------------------------------------------
// Payload builders
// ---------------------------------------------------------------------------

export function toMonthlyBudgetPayload(
  year: number,
  month: number,
  limit: string,
): CreateBudgetPayload {
  return { scope: 'MONTHLY_OVERALL', year, month, total_limit: normalizeAmount(limit) }
}

export function toEventBudgetPayload(bookId: string, limit: string): CreateBudgetPayload {
  return { scope: 'EVENT', book_id: bookId, total_limit: normalizeAmount(limit) }
}

// ---------------------------------------------------------------------------
// Allocation editor helpers
// ---------------------------------------------------------------------------

let rowCounter = 0

export function newAllocationRow(categoryId = '', amount = ''): AllocationRow {
  rowCounter += 1
  return { key: rowCounter, category_id: categoryId, amount }
}

export function rowsFromBudget(budget: Budget): AllocationRow[] {
  return budget.allocations.map((a) => newAllocationRow(a.category.id, a.amount))
}

/** Changes whenever the persisted allocations change (used to reset the editor after a save). */
export function allocationsSignature(budget: Budget): string {
  return budget.allocations.map((a) => `${a.category.id}:${a.amount}`).join('|')
}

export interface AllocationValidation {
  rowErrors: Record<number, AllocationRowErrors>
  form?: string
}

/**
 * Client-side validation mirroring the documented server rules (UI_UX_SPECIFICATION §5,
 * openapi PUT /budgets/{id}/allocations/): category required and unique, amount ≥ 0 with
 * ≤ 2 dp, inactive categories cannot be newly submitted, and the total may not exceed the
 * limit (equal is allowed).  The server remains authoritative.
 */
export function validateAllocations(
  rows: AllocationRow[],
  totalLimit: string,
  inactiveCategoryIds: ReadonlySet<string>,
): AllocationValidation {
  const rowErrors: Record<number, AllocationRowErrors> = {}
  const seen = new Set<string>()

  rows.forEach((row, index) => {
    const errors: AllocationRowErrors = {}
    if (!row.category_id) {
      errors.category = 'Select a category.'
    } else if (seen.has(row.category_id)) {
      errors.category = 'Each category may appear only once.'
    } else if (inactiveCategoryIds.has(row.category_id)) {
      errors.category = 'This category is inactive and cannot be allocated. Remove or change it.'
    }
    if (row.category_id) seen.add(row.category_id)

    const amountError = validateNonNegativeAmount(row.amount)
    if (amountError) errors.amount = amountError

    if (errors.category || errors.amount) rowErrors[index] = errors
  })

  let form: string | undefined
  if (Object.keys(rowErrors).length === 0) {
    const total = toCents(sumMoney(rows.map((r) => normalizeAmount(r.amount))) ?? '0.00')
    const limit = toCents(totalLimit)
    if (total !== null && limit !== null && total > limit) {
      form = 'Allocation total exceeds the budget total limit.'
    }
  }
  return { rowErrors, form }
}

export function toAllocationInputs(rows: AllocationRow[]): AllocationInput[] {
  return rows.map((r) => ({ category_id: r.category_id, amount: normalizeAmount(r.amount) }))
}

function asMessages(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    const parts = value.filter((v): v is string => typeof v === 'string')
    return parts.length > 0 ? parts.join(' ') : undefined
  }
  return undefined
}

/**
 * Map backend allocation errors.  Item errors are keyed by the zero-based item
 * index (`{"allocations": {"0": {"category_id": [...]}}}`); the total-limit error is
 * a plain list (`{"allocations": [...]}`).  Anything else becomes a form-level message.
 */
export function mapAllocationServerErrors(details: unknown): AllocationServerErrors {
  const result: AllocationServerErrors = { rows: {} }
  if (typeof details !== 'object' || details === null) return result
  const leftovers: string[] = []

  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    if (key === 'allocations' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [index, item] of Object.entries(value as Record<string, unknown>)) {
        const i = Number(index)
        if (!Number.isInteger(i) || typeof item !== 'object' || item === null) continue
        const fields = item as Record<string, unknown>
        const category = asMessages(fields.category_id)
        const amount = asMessages(fields.amount)
        if (category || amount) result.rows[i] = { category, amount }
      }
      continue
    }
    const text = asMessages(value)
    if (text) leftovers.push(text)
  }
  if (leftovers.length > 0) result.form = leftovers.join(' ')
  return result
}

/** Map backend errors for budget create/update (limit, book, period). */
export function mapBudgetServerErrors(details: unknown): {
  total_limit?: string
  book_id?: string
  form?: string
} {
  const errors: { total_limit?: string; book_id?: string; form?: string } = {}
  if (typeof details !== 'object' || details === null) return errors
  const leftovers: string[] = []
  for (const [key, value] of Object.entries(details as Record<string, unknown>)) {
    const text = asMessages(value)
    if (!text) continue
    if (key === 'total_limit' || key === 'book_id') errors[key] = text
    else leftovers.push(text)
  }
  if (leftovers.length > 0) errors.form = leftovers.join(' ')
  return errors
}
