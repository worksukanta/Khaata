import { describe, expect, it } from 'vitest'
import {
  formatDate,
  formatDateRange,
  formatMoney,
  getCurrentYearMonth,
  mapServerErrors,
  parseYearMonth,
  shiftMonth,
  sortMonthlyDesc,
  toCreatePayload,
  toUpdatePayload,
  validateBookForm,
} from './utils'
import { makeMonthlyBook } from './testUtils'

describe('shiftMonth', () => {
  it('moves within a year', () => {
    expect(shiftMonth({ year: 2026, month: 5 }, 1)).toEqual({ year: 2026, month: 6 })
    expect(shiftMonth({ year: 2026, month: 5 }, -1)).toEqual({ year: 2026, month: 4 })
  })

  it('rolls December → January into the next year', () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
  })

  it('rolls January → December into the previous year', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
  })
})

describe('getCurrentYearMonth', () => {
  it('uses the supplied timezone, not UTC', () => {
    // 2026-12-31 20:00 UTC is already 1 Jan 2027 in Asia/Kolkata (UTC+5:30)
    const now = new Date('2026-12-31T20:00:00Z')
    expect(getCurrentYearMonth('Asia/Kolkata', now)).toEqual({ year: 2027, month: 1 })
    expect(getCurrentYearMonth('UTC', now)).toEqual({ year: 2026, month: 12 })
  })

  it('falls back to local time for an invalid timezone', () => {
    const now = new Date(2026, 5, 15, 12)
    expect(getCurrentYearMonth('Not/AZone', now)).toEqual({ year: 2026, month: 6 })
  })
})

describe('parseYearMonth', () => {
  it('parses valid params', () => {
    expect(parseYearMonth('2026', '3')).toEqual({ year: 2026, month: 3 })
  })

  it.each([
    [null, '3'],
    ['2026', null],
    ['abcd', '3'],
    ['2026', '13'],
    ['2026', '0'],
    ['1999', '5'],
    ['2201', '5'],
    ['26', '5'],
  ])('rejects %s / %s', (y, m) => {
    expect(parseYearMonth(y, m)).toBeUndefined()
  })
})

describe('formatting', () => {
  it('formats ISO dates as DD MMM YYYY without timezone shift', () => {
    expect(formatDate('2026-10-16')).toBe('16 Oct 2026')
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026')
    expect(formatDate(null)).toBe('')
  })

  it('formats date ranges', () => {
    expect(formatDateRange('2026-10-16', '2026-10-21')).toBe('16 Oct 2026 – 21 Oct 2026')
    expect(formatDateRange('2026-10-16', null)).toBe('From 16 Oct 2026')
    expect(formatDateRange(null, '2026-10-21')).toBe('Until 21 Oct 2026')
    expect(formatDateRange(null, null)).toBeNull()
  })

  it('formats money with en-IN grouping from the decimal string', () => {
    expect(formatMoney('0.00')).toBe('₹0.00')
    expect(formatMoney('1234.50')).toBe('₹1,234.50')
    expect(formatMoney('1234567.89')).toBe('₹12,34,567.89')
    expect(formatMoney('-5000.00')).toBe('-₹5,000.00')
  })

  it('sorts monthly books newest first', () => {
    const a = makeMonthlyBook(2026, 1)
    const b = makeMonthlyBook(2026, 12)
    const c = makeMonthlyBook(2025, 12)
    expect(sortMonthlyDesc([a, c, b]).map((x) => x.name)).toEqual([
      'December 2026',
      'January 2026',
      'December 2025',
    ])
  })
})

describe('validateBookForm', () => {
  const base = { name: 'Trip', description: '', start_date: '', end_date: '' }

  it('requires a name', () => {
    expect(validateBookForm({ ...base, name: '' }, 'GENERAL').name).toBe('Name is required.')
  })

  it('rejects a whitespace-only name', () => {
    expect(validateBookForm({ ...base, name: '   \t ' }, 'EVENT').name).toBe('Name is required.')
  })

  it('enforces the documented name and description limits', () => {
    expect(validateBookForm({ ...base, name: 'x'.repeat(151) }, 'GENERAL').name).toMatch(/150/)
    expect(validateBookForm({ ...base, name: 'x'.repeat(150) }, 'GENERAL').name).toBeUndefined()
    expect(validateBookForm({ ...base, description: 'x'.repeat(5001) }, 'GENERAL').description).toMatch(/5000/)
  })

  it('rejects an end date before the start date for events', () => {
    const errors = validateBookForm({ ...base, start_date: '2026-10-21', end_date: '2026-10-16' }, 'EVENT')
    expect(errors.end_date).toBe('End date cannot be earlier than start date.')
  })

  it('accepts equal dates and single dates', () => {
    expect(validateBookForm({ ...base, start_date: '2026-10-16', end_date: '2026-10-16' }, 'EVENT')).toEqual({})
    expect(validateBookForm({ ...base, end_date: '2026-10-16' }, 'EVENT')).toEqual({})
  })

  it('ignores dates for general books', () => {
    expect(validateBookForm({ ...base, start_date: '2026-10-21', end_date: '2026-10-16' }, 'GENERAL')).toEqual({})
  })
})

describe('payload builders', () => {
  it('trims the name and omits empty optional fields on create', () => {
    expect(toCreatePayload({ name: '  Trip ', description: ' ', start_date: '', end_date: '' }, 'EVENT')).toEqual({
      type: 'EVENT',
      name: 'Trip',
    })
  })

  it('includes dates for events and drops them for general books', () => {
    const values = { name: 'A', description: 'd', start_date: '2026-10-16', end_date: '2026-10-21' }
    expect(toCreatePayload(values, 'EVENT')).toEqual({
      type: 'EVENT',
      name: 'A',
      description: 'd',
      start_date: '2026-10-16',
      end_date: '2026-10-21',
    })
    expect(toCreatePayload(values, 'GENERAL')).toEqual({ type: 'GENERAL', name: 'A', description: 'd' })
  })

  it('sends null to clear event dates on update, and no dates for general', () => {
    const values = { name: ' A ', description: '', start_date: '', end_date: '' }
    expect(toUpdatePayload(values, 'EVENT')).toEqual({
      name: 'A',
      description: '',
      start_date: null,
      end_date: null,
    })
    expect(toUpdatePayload(values, 'GENERAL')).toEqual({ name: 'A', description: '' })
  })
})

describe('mapServerErrors', () => {
  it('maps known fields and routes the rest to the form-level message', () => {
    expect(
      mapServerErrors({ name: ['Bad name.'], end_date: ['Bad end.'], detail: ['Archived books cannot be edited.'] }, 'EVENT'),
    ).toEqual({
      name: 'Bad name.',
      end_date: 'Bad end.',
      form: 'Archived books cannot be edited.',
    })
  })

  it('does not map date fields for general books', () => {
    expect(mapServerErrors({ start_date: ['x'] }, 'GENERAL')).toEqual({ form: 'x' })
  })

  it('handles missing details', () => {
    expect(mapServerErrors(undefined, 'EVENT')).toEqual({})
  })
})
