/**
 * Tests for the Budgets API service: endpoints, methods, query parameters,
 * request bodies and error propagation.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import apiClient from '@/services/api/client'
import {
  createBudget,
  getBudget,
  listBudgets,
  replaceAllocations,
  updateBudget,
} from '@/services/api/budgets'

const client = vi.mocked(apiClient)
const ID = '11111111-2222-4333-8444-555555555555'
const BOOK = '22222222-3333-4444-8555-666666666666'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listBudgets', () => {
  it('sends no params when no filters are given', async () => {
    client.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })

    await listBudgets()

    expect(client.get).toHaveBeenCalledWith('/api/v1/budgets/', {
      params: {},
      signal: undefined,
    })
  })

  it('sends only supplied filters', async () => {
    client.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })

    await listBudgets({ scope: 'EVENT', year: 2026, month: 10, book_id: BOOK, page: 2 })

    expect(client.get).toHaveBeenCalledWith('/api/v1/budgets/', {
      params: { scope: 'EVENT', year: 2026, month: 10, book_id: BOOK, page: 2 },
      signal: undefined,
    })
  })

  it('returns the paginated response', async () => {
    const page = { count: 1, next: null, previous: null, results: [{ id: ID }] }
    client.get.mockResolvedValue({ data: page })

    expect(await listBudgets({ scope: 'MONTHLY_OVERALL' })).toBe(page)
  })
})

describe('createBudget', () => {
  it('POSTs a monthly overall budget', async () => {
    client.post.mockResolvedValue({ data: { id: ID } })
    const payload = {
      scope: 'MONTHLY_OVERALL' as const,
      year: 2026,
      month: 10,
      total_limit: '10000.00',
    }

    const result = await createBudget(payload)

    expect(client.post).toHaveBeenCalledWith('/api/v1/budgets/', payload)
    expect(result).toEqual({ id: ID })
  })

  it('POSTs an event budget', async () => {
    client.post.mockResolvedValue({ data: { id: ID } })
    const payload = { scope: 'EVENT' as const, book_id: BOOK, total_limit: '500.00' }

    await createBudget(payload)

    expect(client.post).toHaveBeenCalledWith('/api/v1/budgets/', payload)
  })

  it('propagates validation errors', async () => {
    const error = { error: { code: 'validation_error', message: 'bad' } }
    client.post.mockRejectedValue(error)

    await expect(
      createBudget({ scope: 'EVENT', book_id: BOOK, total_limit: '1.00' }),
    ).rejects.toBe(error)
  })
})

describe('getBudget', () => {
  it('GETs /api/v1/budgets/{id}/', async () => {
    client.get.mockResolvedValue({ data: { id: ID } })

    expect(await getBudget(ID)).toEqual({ id: ID })
    expect(client.get).toHaveBeenCalledWith(`/api/v1/budgets/${ID}/`, { signal: undefined })
  })

  it('propagates not_found', async () => {
    const error = { error: { code: 'not_found', message: 'nope' } }
    client.get.mockRejectedValue(error)

    await expect(getBudget(ID)).rejects.toBe(error)
  })
})

describe('updateBudget', () => {
  it('PATCHes the total limit', async () => {
    client.patch.mockResolvedValue({ data: { id: ID, total_limit: '900.00' } })

    const result = await updateBudget(ID, { total_limit: '900.00' })

    expect(client.patch).toHaveBeenCalledWith(`/api/v1/budgets/${ID}/`, {
      total_limit: '900.00',
    })
    expect(result).toEqual({ id: ID, total_limit: '900.00' })
  })
})

describe('replaceAllocations', () => {
  it('PUTs the full allocation list', async () => {
    client.put.mockResolvedValue({ data: { id: ID } })
    const allocations = [
      { category_id: 'c1', amount: '100.00' },
      { category_id: 'c2', amount: '0.00' },
    ]

    await replaceAllocations(ID, allocations)

    expect(client.put).toHaveBeenCalledWith(`/api/v1/budgets/${ID}/allocations/`, {
      allocations,
    })
  })

  it('sends an empty list to clear all allocations', async () => {
    client.put.mockResolvedValue({ data: { id: ID } })

    await replaceAllocations(ID, [])

    expect(client.put).toHaveBeenCalledWith(`/api/v1/budgets/${ID}/allocations/`, {
      allocations: [],
    })
  })

  it('propagates per-item validation errors', async () => {
    const error = {
      error: {
        code: 'validation_error',
        message: 'bad',
        details: { allocations: { '0': { category_id: ['Invalid'] } } },
      },
    }
    client.put.mockRejectedValue(error)

    await expect(replaceAllocations(ID, [{ category_id: 'x', amount: '1.00' }])).rejects.toBe(error)
  })
})
