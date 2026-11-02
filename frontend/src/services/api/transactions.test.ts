/**
 * Tests for the Transactions API service: endpoints, methods, query parameters,
 * request bodies, and error propagation.
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
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from '@/services/api/transactions'
import type { CreateTransactionPayload, Transaction, UpdateTransactionPayload } from '@/types'

const client = vi.mocked(apiClient)
const TXN_ID = '11111111-2222-4333-8444-555555555555'
const BOOK_ID = '22222222-3333-4444-8555-666666666666'

const sampleTxn: Transaction = {
  id: TXN_ID,
  book_id: BOOK_ID,
  type: 'EXPENSE',
  amount: '250.00',
  transaction_date: '2026-10-27',
  category: { id: '33333333-4444-4555-8666-777777777777', name: 'Snacks', type: 'EXPENSE' },
  payment_method: { id: '44444444-5555-4666-8777-888888888888', name: 'UPI' },
  description: 'Evening snacks',
  created_at: '2026-10-27T10:00:00Z',
  updated_at: '2026-10-27T10:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listTransactions', () => {
  it('GETs /api/v1/transactions/ with no params when no filters are provided', async () => {
    client.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    const result = await listTransactions()
    expect(client.get).toHaveBeenCalledWith('/api/v1/transactions/', {
      params: {},
      signal: undefined,
    })
    expect(result.count).toBe(0)
  })

  it('sends all supported query parameters when provided', async () => {
    client.get.mockResolvedValue({ data: { count: 1, next: null, previous: null, results: [sampleTxn] } })
    const ac = new AbortController()

    const result = await listTransactions(
      {
        book_id: BOOK_ID,
        type: 'EXPENSE',
        category_id: '33333333-4444-4555-8666-777777777777',
        payment_method_id: '44444444-5555-4666-8777-888888888888',
        date_from: '2026-10-01',
        date_to: '2026-10-31',
        search: '  tea ',
        ordering: '-amount',
        page: 2,
      },
      ac.signal,
    )

    expect(client.get).toHaveBeenCalledWith('/api/v1/transactions/', {
      params: {
        book_id: BOOK_ID,
        type: 'EXPENSE',
        category_id: '33333333-4444-4555-8666-777777777777',
        payment_method_id: '44444444-5555-4666-8777-888888888888',
        date_from: '2026-10-01',
        date_to: '2026-10-31',
        search: 'tea',
        ordering: '-amount',
        page: 2,
      },
      signal: ac.signal,
    })
    expect(result.results).toHaveLength(1)
  })
})

describe('createTransaction', () => {
  it('POSTs /api/v1/transactions/ with payload and returns created transaction', async () => {
    client.post.mockResolvedValue({ data: sampleTxn })
    const payload: CreateTransactionPayload = {
      book_id: BOOK_ID,
      type: 'EXPENSE',
      amount: '250.00',
      transaction_date: '2026-10-27',
      category_id: '33333333-4444-4555-8666-777777777777',
      payment_method_id: null,
      description: 'Snacks',
    }

    const result = await createTransaction(payload)
    expect(client.post).toHaveBeenCalledWith('/api/v1/transactions/', payload)
    expect(result).toEqual(sampleTxn)
  })
})

describe('getTransaction', () => {
  it('GETs /api/v1/transactions/{id}/ and returns transaction', async () => {
    client.get.mockResolvedValue({ data: sampleTxn })
    const result = await getTransaction(TXN_ID)
    expect(client.get).toHaveBeenCalledWith(`/api/v1/transactions/${TXN_ID}/`, {
      signal: undefined,
    })
    expect(result).toEqual(sampleTxn)
  })
})

describe('updateTransaction', () => {
  it('PATCHes /api/v1/transactions/{id}/ with partial update and returns updated transaction', async () => {
    const updated = { ...sampleTxn, amount: '300.00' }
    client.patch.mockResolvedValue({ data: updated })
    const payload: UpdateTransactionPayload = { amount: '300.00' }

    const result = await updateTransaction(TXN_ID, payload)
    expect(client.patch).toHaveBeenCalledWith(`/api/v1/transactions/${TXN_ID}/`, payload)
    expect(result.amount).toBe('300.00')
  })
})

describe('deleteTransaction', () => {
  it('DELETEs /api/v1/transactions/{id}/', async () => {
    client.delete.mockResolvedValue({ status: 204 })
    await deleteTransaction(TXN_ID)
    expect(client.delete).toHaveBeenCalledWith(`/api/v1/transactions/${TXN_ID}/`)
  })
})
