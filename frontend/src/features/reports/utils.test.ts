import { describe, expect, it } from 'vitest'
import type { ReportUrlState } from './types'
import {
  DEFAULT_ORDERING,
  hasActiveFilters,
  isRangeInverted,
  isValidIsoDate,
  monthBounds,
  parseReportUrl,
  serializeReportUrl,
  summarizeExport,
  toExportParams,
  toListParams,
} from './utils'

const BOOK = '00000000-0000-4000-8000-000000000001'
const CAT = '10000000-0000-4000-8000-000000000002'
const PM = '20000000-0000-4000-8000-000000000003'
const OCT = { year: 2026, month: 10 }

function parse(qs: string): ReportUrlState {
  return parseReportUrl(new URLSearchParams(qs))
}

describe('monthBounds', () => {
  it('returns first and last day, honouring month length and leap years', () => {
    expect(monthBounds({ year: 2026, month: 10 })).toEqual({
      date_from: '2026-10-01',
      date_to: '2026-10-31',
    })
    expect(monthBounds({ year: 2026, month: 2 }).date_to).toBe('2026-02-28')
    expect(monthBounds({ year: 2028, month: 2 }).date_to).toBe('2028-02-29')
    expect(monthBounds({ year: 2026, month: 4 }).date_to).toBe('2026-04-30')
    expect(monthBounds({ year: 2026, month: 12 })).toEqual({
      date_from: '2026-12-01',
      date_to: '2026-12-31',
    })
  })
})

describe('isValidIsoDate', () => {
  it('accepts real dates only', () => {
    expect(isValidIsoDate('2026-10-31')).toBe(true)
    expect(isValidIsoDate('2026-02-29')).toBe(false)
    expect(isValidIsoDate('2026-13-01')).toBe(false)
    expect(isValidIsoDate('26-10-01')).toBe(false)
    expect(isValidIsoDate('')).toBe(false)
  })
})

describe('parseReportUrl', () => {
  it('defaults to the combined monthly scope with default filters', () => {
    const s = parse('')
    expect(s.bookId).toBeUndefined()
    expect(s.bookInvalid).toBe(false)
    expect(s.period).toBe('month')
    expect(s.year).toBeUndefined()
    expect(s.filters).toMatchObject({ search: '', ordering: DEFAULT_ORDERING, page: 1 })
  })

  it('reads year/month, book and filters', () => {
    const s = parse(
      `year=2026&month=3&bookId=${BOOK}&type=INCOME&categoryId=${CAT}&paymentMethodId=${PM}&search=rent&ordering=-amount&page=2`,
    )
    expect(s).toMatchObject({ year: 2026, month: 3, bookId: BOOK })
    expect(s.filters).toMatchObject({
      type: 'INCOME',
      category_id: CAT,
      payment_method_id: PM,
      search: 'rent',
      ordering: '-amount',
      page: 2,
    })
  })

  it('a selected book switches the default scope to all dates and never uses "month"', () => {
    expect(parse(`bookId=${BOOK}`).period).toBe('all')
    expect(parse(`bookId=${BOOK}&period=month`).period).toBe('all')
    expect(parse(`bookId=${BOOK}&period=range`).period).toBe('range')
  })

  it('ignores malformed values instead of forwarding them to the API', () => {
    const s = parse(
      'year=1999&month=13&bookId=nope&type=OTHER&categoryId=x&paymentMethodId=y&ordering=drop&page=0&dateFrom=2026-02-30&dateTo=bad&period=weird',
    )
    expect(s.year).toBeUndefined()
    expect(s.month).toBeUndefined()
    expect(s.bookId).toBeUndefined()
    expect(s.bookInvalid).toBe(true)
    expect(s.period).toBe('month')
    expect(s.filters).toMatchObject({
      type: undefined,
      category_id: undefined,
      payment_method_id: undefined,
      date_from: undefined,
      date_to: undefined,
      ordering: DEFAULT_ORDERING,
      page: 1,
    })
  })
})

describe('serializeReportUrl', () => {
  it('omits defaults', () => {
    expect(serializeReportUrl(parse('')).toString()).toBe('')
  })

  it('round-trips a fully populated state', () => {
    const qs = new URLSearchParams(
      `year=2026&month=3&period=range&type=EXPENSE&categoryId=${CAT}&paymentMethodId=${PM}&dateFrom=2026-03-02&dateTo=2026-03-09&search=tea&ordering=amount&page=3`,
    )
    expect(Object.fromEntries(serializeReportUrl(parseReportUrl(qs)))).toEqual(
      Object.fromEntries(qs),
    )
  })

  it('drops stale custom dates when the scope is not "range"', () => {
    const s = parse('dateFrom=2026-03-02&dateTo=2026-03-09')
    expect(serializeReportUrl({ ...s, period: 'month' }).has('dateFrom')).toBe(false)
  })
})

describe('toExportParams / toListParams (one source of filters)', () => {
  it('month scope sends the month bounds and no book', () => {
    expect(toExportParams(parse(''), OCT, undefined)).toEqual({
      date_from: '2026-10-01',
      date_to: '2026-10-31',
    })
  })

  it('combines book, type, category, payment method, search and dates with the same keys the API documents', () => {
    const s = parse(
      `bookId=${BOOK}&period=range&type=EXPENSE&categoryId=${CAT}&paymentMethodId=${PM}&dateFrom=2026-10-05&dateTo=2026-10-20`,
    )
    expect(toExportParams(s, OCT, '  tea ')).toEqual({
      book_id: BOOK,
      type: 'EXPENSE',
      category_id: CAT,
      payment_method_id: PM,
      date_from: '2026-10-05',
      date_to: '2026-10-20',
      search: 'tea',
    })
  })

  it('"all dates" sends no date bounds', () => {
    const params = toExportParams(parse(`bookId=${BOOK}`), OCT, undefined)
    expect(params).toEqual({ book_id: BOOK })
  })

  it('a range with only one end sends only that end', () => {
    const params = toExportParams(parse('period=range&dateFrom=2026-10-05'), OCT, undefined)
    expect(params).toEqual({ date_from: '2026-10-05' })
  })

  it('list params equal export params plus ordering and page only', () => {
    const s = parse(`bookId=${BOOK}&type=INCOME&ordering=-amount&page=4`)
    const exportParams = toExportParams(s, OCT, 'x')
    const listParams = toListParams(s, OCT, 'x')
    expect(listParams).toEqual({ ...exportParams, ordering: '-amount', page: 4 })
    expect(exportParams).not.toHaveProperty('ordering')
    expect(exportParams).not.toHaveProperty('page')
  })

  it('ignores the ALL pseudo-type', () => {
    const s = parse('')
    s.filters.type = 'ALL'
    expect(toExportParams(s, OCT, undefined)).not.toHaveProperty('type')
  })
})

describe('isRangeInverted / hasActiveFilters', () => {
  it('detects an inverted custom range only', () => {
    expect(isRangeInverted(parse('period=range&dateFrom=2026-10-09&dateTo=2026-10-01'))).toBe(true)
    expect(isRangeInverted(parse('period=range&dateFrom=2026-10-01&dateTo=2026-10-01'))).toBe(false)
    expect(isRangeInverted(parse('period=range&dateFrom=2026-10-09'))).toBe(false)
    expect(isRangeInverted(parse('dateFrom=2026-10-09&dateTo=2026-10-01'))).toBe(false)
  })

  it('does not count scope (book/month/all dates) as a filter', () => {
    expect(hasActiveFilters(parse(''))).toBe(false)
    expect(hasActiveFilters(parse(`bookId=${BOOK}`))).toBe(false)
    expect(hasActiveFilters(parse('year=2026&month=3'))).toBe(false)
  })

  it('counts type, category, method, search, range dates and sorting', () => {
    expect(hasActiveFilters(parse('type=INCOME'))).toBe(true)
    expect(hasActiveFilters(parse(`categoryId=${CAT}`))).toBe(true)
    expect(hasActiveFilters(parse(`paymentMethodId=${PM}`))).toBe(true)
    expect(hasActiveFilters(parse('search=x'))).toBe(true)
    expect(hasActiveFilters(parse('period=range&dateFrom=2026-10-01'))).toBe(true)
    expect(hasActiveFilters(parse('ordering=amount'))).toBe(true)
  })
})

describe('summarizeExport', () => {
  const lookups = {
    monthLabel: 'October 2026',
    formatDate: (iso: string) => `D(${iso})`,
  }

  it('summarises the combined monthly scope', () => {
    expect(summarizeExport(parse(''), lookups)).toEqual([
      'Books: all books',
      'Dates: October 2026',
    ])
  })

  it('lists every active filter with resolved names', () => {
    const s = parse(
      `bookId=${BOOK}&period=range&type=INCOME&categoryId=${CAT}&paymentMethodId=${PM}&dateFrom=2026-10-01&search=pay`,
    )
    expect(
      summarizeExport(s, {
        ...lookups,
        bookName: 'Goa Trip',
        categoryName: 'Salary',
        paymentMethodName: 'UPI',
      }),
    ).toEqual([
      'Book: Goa Trip',
      'Dates: D(2026-10-01) to any date',
      'Type: Income',
      'Category: Salary',
      'Payment method: UPI',
      'Search: “pay”',
    ])
  })

  it('falls back to generic labels for unresolved names and all dates', () => {
    const s = parse(`bookId=${BOOK}&categoryId=${CAT}`)
    const lines = summarizeExport(s, lookups)
    expect(lines).toContain('Book: Selected book')
    expect(lines).toContain('Dates: all dates')
    expect(lines).toContain('Category: Selected category')
  })
})
