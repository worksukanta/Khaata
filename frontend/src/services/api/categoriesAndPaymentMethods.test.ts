/**
 * Tests for Categories and Payment Methods API services.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

import apiClient from '@/services/api/client'
import { listCategories } from '@/services/api/categories'
import { listPaymentMethods } from '@/services/api/paymentMethods'

const client = vi.mocked(apiClient)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listCategories', () => {
  it('GETs /api/v1/categories/ with empty params by default', async () => {
    client.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    await listCategories()
    expect(client.get).toHaveBeenCalledWith('/api/v1/categories/', {
      params: {},
      signal: undefined,
    })
  })

  it('sends type, is_active, search, page parameters', async () => {
    client.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    await listCategories({
      type: 'EXPENSE',
      is_active: true,
      search: 'food',
      page: 1,
    })
    expect(client.get).toHaveBeenCalledWith('/api/v1/categories/', {
      params: {
        type: 'EXPENSE',
        is_active: true,
        search: 'food',
        page: 1,
      },
      signal: undefined,
    })
  })
})

describe('listPaymentMethods', () => {
  it('GETs /api/v1/payment-methods/ with empty params by default', async () => {
    client.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    await listPaymentMethods()
    expect(client.get).toHaveBeenCalledWith('/api/v1/payment-methods/', {
      params: {},
      signal: undefined,
    })
  })

  it('sends is_active, search, page parameters', async () => {
    client.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    await listPaymentMethods({
      is_active: true,
      search: 'upi',
      page: 1,
    })
    expect(client.get).toHaveBeenCalledWith('/api/v1/payment-methods/', {
      params: {
        is_active: true,
        search: 'upi',
        page: 1,
      },
      signal: undefined,
    })
  })
})
