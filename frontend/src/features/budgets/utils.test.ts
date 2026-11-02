import { describe, expect, it } from 'vitest'
import type { AllocationRow } from './types'
import {
  absMoney,
  barPercent,
  fromCents,
  isNegativeMoney,
  mapAllocationServerErrors,
  mapBudgetServerErrors,
  normalizeAmount,
  sumMoney,
  toAllocationInputs,
  toCents,
  toEventBudgetPayload,
  toMonthlyBudgetPayload,
  validateAllocations,
  validateLimit,
  validateNonNegativeAmount,
} from './utils'

const row = (category_id: string, amount: string, key = 1): AllocationRow => ({
  key,
  category_id,
  amount,
})

describe('integer-cent money helpers', () => {
  it('parses and formats exactly', () => {
    expect(toCents('123.45')).toBe(12345n)
    expect(toCents('5')).toBe(500n)
    expect(toCents('5.5')).toBe(550n)
    expect(toCents('-0.01')).toBe(-1n)
    expect(toCents('1.234')).toBeNull()
    expect(toCents('abc')).toBeNull()
    expect(fromCents(12345n)).toBe('123.45')
    expect(fromCents(-5n)).toBe('-0.05')
    expect(fromCents(0n)).toBe('0.00')
  })

  it('sums without floating point error', () => {
    expect(sumMoney(['0.10', '0.20'])).toBe('0.30')
    expect(sumMoney(['999999999999.99', '0.01'])).toBe('1000000000000.00')
    expect(sumMoney([])).toBe('0.00')
    expect(sumMoney(['1.00', 'x'])).toBeNull()
  })

  it('detects negative values and strips the sign', () => {
    expect(isNegativeMoney('-1.00')).toBe(true)
    expect(isNegativeMoney('0.00')).toBe(false)
    expect(isNegativeMoney('1.00')).toBe(false)
    expect(absMoney('-250.00')).toBe('250.00')
    expect(absMoney('250.00')).toBe('250.00')
  })
})

describe('barPercent', () => {
  it('returns 0 for zero spend or zero/invalid whole', () => {
    expect(barPercent('0.00', '100.00')).toBe(0)
    expect(barPercent('50.00', '0.00')).toBe(0)
    expect(barPercent('x', '100.00')).toBe(0)
  })

  it('computes whole percentages and never renders non-zero as empty', () => {
    expect(barPercent('25.00', '100.00')).toBe(25)
    expect(barPercent('0.01', '100000.00')).toBe(1)
  })

  it('caps at 100 when overspent', () => {
    expect(barPercent('250.00', '100.00')).toBe(100)
  })
})

describe('amount validation', () => {
  it('allows zero but rejects empty, negative, malformed and too-precise values', () => {
    expect(validateNonNegativeAmount('0')).toBeUndefined()
    expect(validateNonNegativeAmount('0.00')).toBeUndefined()
    expect(validateNonNegativeAmount('1500.5')).toBeUndefined()
    expect(validateNonNegativeAmount('')).toBe('Amount is required.')
    expect(validateNonNegativeAmount('-1')).toBe('Amount cannot be negative.')
    expect(validateNonNegativeAmount('1.234')).toMatch(/at most 2 decimal/)
    expect(validateNonNegativeAmount('abc')).toMatch(/valid amount/)
    expect(validateNonNegativeAmount('1'.repeat(13))).toBe('Amount is too large.')
  })

  it('words limit errors for the budget limit field', () => {
    expect(validateLimit('')).toBe('Budget limit is required.')
    expect(validateLimit('-5')).toBe('Budget limit cannot be negative.')
    expect(validateLimit('0')).toBeUndefined()
  })

  it('normalises to two decimals', () => {
    expect(normalizeAmount('500')).toBe('500.00')
    expect(normalizeAmount(' 12.5 ')).toBe('12.50')
    expect(normalizeAmount('1.25')).toBe('1.25')
  })
})

describe('payload builders', () => {
  it('builds monthly and event payloads', () => {
    expect(toMonthlyBudgetPayload(2026, 10, '15000')).toEqual({
      scope: 'MONTHLY_OVERALL',
      year: 2026,
      month: 10,
      total_limit: '15000.00',
    })
    expect(toEventBudgetPayload('book-1', '99.5')).toEqual({
      scope: 'EVENT',
      book_id: 'book-1',
      total_limit: '99.50',
    })
  })

  it('builds normalised allocation inputs', () => {
    expect(toAllocationInputs([row('c1', '10'), row('c2', '0.5', 2)])).toEqual([
      { category_id: 'c1', amount: '10.00' },
      { category_id: 'c2', amount: '0.50' },
    ])
  })
})

describe('validateAllocations', () => {
  const none = new Set<string>()

  it('accepts a valid set, including a total equal to the limit', () => {
    const result = validateAllocations(
      [row('c1', '60.00', 1), row('c2', '40.00', 2)],
      '100.00',
      none,
    )
    expect(result.rowErrors).toEqual({})
    expect(result.form).toBeUndefined()
  })

  it('rejects a total above the limit', () => {
    const result = validateAllocations(
      [row('c1', '60.00', 1), row('c2', '40.01', 2)],
      '100.00',
      none,
    )
    expect(result.form).toBe('Allocation total exceeds the budget total limit.')
  })

  it('requires a category, rejects duplicates and inactive categories', () => {
    const result = validateAllocations(
      [row('', '1', 1), row('c1', '1', 2), row('c1', '1', 3), row('old', '1', 4)],
      '100.00',
      new Set(['old']),
    )
    expect(result.rowErrors[0].category).toBe('Select a category.')
    expect(result.rowErrors[1]).toBeUndefined()
    expect(result.rowErrors[2].category).toBe('Each category may appear only once.')
    expect(result.rowErrors[3].category).toMatch(/inactive/)
  })

  it('rejects negative and malformed amounts and skips the total check', () => {
    const result = validateAllocations(
      [row('c1', '-1', 1), row('c2', '1.234', 2)],
      '1.00',
      none,
    )
    expect(result.rowErrors[0].amount).toBe('Amount cannot be negative.')
    expect(result.rowErrors[1].amount).toMatch(/at most 2 decimal/)
    expect(result.form).toBeUndefined()
  })

  it('allows an empty list (clears all allocations)', () => {
    expect(validateAllocations([], '0.00', none)).toEqual({ rowErrors: {}, form: undefined })
  })
})

describe('server error mappers', () => {
  it('maps per-item allocation errors by index', () => {
    const mapped = mapAllocationServerErrors({
      allocations: {
        '0': { category_id: ['Inactive category.'] },
        '2': { amount: ['Must be >= 0.'] },
      },
    })
    expect(mapped.rows[0]).toEqual({ category: 'Inactive category.', amount: undefined })
    expect(mapped.rows[2]).toEqual({ category: undefined, amount: 'Must be >= 0.' })
    expect(mapped.form).toBeUndefined()
  })

  it('maps the total-limit list error to a form message', () => {
    const mapped = mapAllocationServerErrors({ allocations: ['Total exceeds limit.'] })
    expect(mapped.rows).toEqual({})
    expect(mapped.form).toBe('Total exceeds limit.')
  })

  it('tolerates missing or odd details', () => {
    expect(mapAllocationServerErrors(undefined)).toEqual({ rows: {} })
    expect(mapAllocationServerErrors('x')).toEqual({ rows: {} })
  })

  it('maps budget field errors and leftovers', () => {
    expect(
      mapBudgetServerErrors({
        total_limit: ['Cannot be below allocated total.'],
        book_id: ['Not an event book.'],
        year: ['Required.'],
      }),
    ).toEqual({
      total_limit: 'Cannot be below allocated total.',
      book_id: 'Not an event book.',
      form: 'Required.',
    })
    expect(mapBudgetServerErrors(null)).toEqual({})
  })
})
