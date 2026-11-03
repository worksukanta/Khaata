/**
 * Tests for the Reports API service: endpoints, query parameters, response
 * pass-through and error propagation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import apiClient from '@/services/api/client'
import { getBookReport, getBudgetUtilization, getMonthlyReport } from '@/services/api/reports'

const client = vi.mocked(apiClient)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('getMonthlyReport', () => {
  it('GETs /api/v1/reports/monthly/ with year and month params', async () => {
    const report = { period: { year: 2026, month: 10 }, income_total: '1.00' }
    client.get.mockResolvedValue({ data: report })

    const result = await getMonthlyReport(2026, 10)

    expect(client.get).toHaveBeenCalledWith('/api/v1/reports/monthly/', {
      params: { year: 2026, month: 10 },
      signal: undefined,
    })
    expect(result).toBe(report)
  })

  it('forwards the abort signal', async () => {
    client.get.mockResolvedValue({ data: {} })
    const controller = new AbortController()

    await getMonthlyReport(2026, 1, controller.signal)

    expect(client.get).toHaveBeenCalledWith('/api/v1/reports/monthly/', {
      params: { year: 2026, month: 1 },
      signal: controller.signal,
    })
  })

  it('propagates API errors', async () => {
    const error = { error: { code: 'validation_error', message: 'bad' } }
    client.get.mockRejectedValue(error)

    await expect(getMonthlyReport(1999, 13)).rejects.toBe(error)
  })
})

describe('getBudgetUtilization', () => {
  it('GETs /api/v1/reports/budget-utilization/ with year and month params', async () => {
    const payload = { period: { year: 2026, month: 3 }, budget: null }
    client.get.mockResolvedValue({ data: payload })

    const result = await getBudgetUtilization(2026, 3)

    expect(client.get).toHaveBeenCalledWith('/api/v1/reports/budget-utilization/', {
      params: { year: 2026, month: 3 },
      signal: undefined,
    })
    expect(result).toEqual({ period: { year: 2026, month: 3 }, budget: null })
  })

  it('propagates API errors', async () => {
    const error = { error: { code: 'unauthenticated', message: 'no' } }
    client.get.mockRejectedValue(error)

    await expect(getBudgetUtilization(2026, 3)).rejects.toBe(error)
  })
})

describe('getBookReport', () => {
  const ID = '00000000-0000-4000-8000-000000000001'

  it('GETs /api/v1/reports/books/{id}/ with no query params', async () => {
    const report = { book: { id: ID }, closing_balance: '-5.00' }
    client.get.mockResolvedValue({ data: report })

    const result = await getBookReport(ID)

    expect(client.get).toHaveBeenCalledWith(`/api/v1/reports/books/${ID}/`, { signal: undefined })
    expect(result).toBe(report)
  })

  it('encodes the id and forwards the abort signal', async () => {
    client.get.mockResolvedValue({ data: {} })
    const controller = new AbortController()

    await getBookReport('a/b', controller.signal)

    expect(client.get).toHaveBeenCalledWith('/api/v1/reports/books/a%2Fb/', {
      signal: controller.signal,
    })
  })

  it('propagates a 404 error envelope', async () => {
    const error = { error: { code: 'not_found', message: 'No such book' } }
    client.get.mockRejectedValue(error)

    await expect(getBookReport(ID)).rejects.toBe(error)
  })
})
