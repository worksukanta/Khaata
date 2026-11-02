/**
 * Tests for the Books API service: endpoints, methods, query parameters,
 * request bodies, status handling and error propagation.
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
import * as booksModule from '@/services/api/books'
import {
  archiveBook,
  createBook,
  ensureMonthlyBook,
  getBook,
  listBooks,
  restoreBook,
  updateBook,
} from '@/services/api/books'
import { getApiErrorCode, getApiErrorMessage, NETWORK_ERROR_MESSAGE } from '@/services/api/errors'

const client = vi.mocked(apiClient)
const ID = '11111111-2222-4333-8444-555555555555'
const book = { id: ID, type: 'EVENT', name: 'Trip' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('listBooks', () => {
  it('GETs /api/v1/books/ with no params when no filters are given', async () => {
    client.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    const result = await listBooks()
    expect(client.get).toHaveBeenCalledWith('/api/v1/books/', { params: {}, signal: undefined })
    expect(result.count).toBe(0)
  })

  it('sends only supplied filters with the documented names', async () => {
    client.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    await listBooks({
      type: 'EVENT',
      search: '  puja ',
      is_archived: false,
      ordering: '-name',
      page: 2,
    })
    expect(client.get).toHaveBeenCalledWith('/api/v1/books/', {
      params: { type: 'EVENT', search: 'puja', is_archived: false, ordering: '-name', page: 2 },
      signal: undefined,
    })
  })

  it('omits blank search and keeps is_archived=true', async () => {
    client.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    await listBooks({ search: '   ', is_archived: true })
    expect(client.get).toHaveBeenCalledWith('/api/v1/books/', {
      params: { is_archived: true },
      signal: undefined,
    })
  })

  it('forwards the AbortSignal for request cancellation', async () => {
    client.get.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } })
    const controller = new AbortController()
    await listBooks({}, controller.signal)
    expect(client.get).toHaveBeenCalledWith('/api/v1/books/', {
      params: {},
      signal: controller.signal,
    })
  })

  it('returns the backend pagination envelope unchanged', async () => {
    const envelope = { count: 42, next: 'http://x/?page=2', previous: null, results: [book] }
    client.get.mockResolvedValue({ data: envelope })
    await expect(listBooks({ page: 1 })).resolves.toEqual(envelope)
  })

  it('propagates API errors', async () => {
    const err = { error: { code: 'network_error', message: 'Network Error' } }
    client.get.mockRejectedValue(err)
    await expect(listBooks()).rejects.toBe(err)
  })
})

describe('createBook', () => {
  it('POSTs the EVENT payload to /api/v1/books/', async () => {
    client.post.mockResolvedValue({ data: book })
    const payload = {
      type: 'EVENT' as const,
      name: 'Durga Puja',
      description: 'Committee',
      start_date: '2026-10-16',
      end_date: '2026-10-21',
    }
    await expect(createBook(payload)).resolves.toEqual(book)
    expect(client.post).toHaveBeenCalledWith('/api/v1/books/', payload)
  })

  it('POSTs the GENERAL payload', async () => {
    client.post.mockResolvedValue({ data: { ...book, type: 'GENERAL' } })
    await createBook({ type: 'GENERAL', name: 'Household' })
    expect(client.post).toHaveBeenCalledWith('/api/v1/books/', { type: 'GENERAL', name: 'Household' })
  })

  it('propagates validation errors', async () => {
    const err = { error: { code: 'validation_error', message: 'bad', details: { name: ['x'] } } }
    client.post.mockRejectedValue(err)
    await expect(createBook({ type: 'GENERAL', name: '' })).rejects.toBe(err)
  })
})

describe('ensureMonthlyBook', () => {
  it('POSTs to the ensure endpoint with year and month in the path', async () => {
    client.post.mockResolvedValue({ status: 200, data: { ...book, type: 'MONTHLY' } })
    await ensureMonthlyBook(2026, 10)
    expect(client.post).toHaveBeenCalledWith('/api/v1/books/monthly/2026/10/ensure/')
  })

  it('reports created=true for HTTP 201', async () => {
    client.post.mockResolvedValue({ status: 201, data: book })
    await expect(ensureMonthlyBook(2026, 10)).resolves.toEqual({ book, created: true })
  })

  it('reports created=false for HTTP 200 (idempotent)', async () => {
    client.post.mockResolvedValue({ status: 200, data: book })
    await expect(ensureMonthlyBook(2026, 10)).resolves.toEqual({ book, created: false })
  })

  it('propagates errors', async () => {
    const err = { error: { code: 'validation_error', message: 'Year out of range' } }
    client.post.mockRejectedValue(err)
    await expect(ensureMonthlyBook(1999, 1)).rejects.toBe(err)
  })
})

describe('getBook / updateBook / archiveBook / restoreBook', () => {
  it('GETs /api/v1/books/{id}/', async () => {
    client.get.mockResolvedValue({ data: book })
    await expect(getBook(ID)).resolves.toEqual(book)
    expect(client.get).toHaveBeenCalledWith(`/api/v1/books/${ID}/`, { signal: undefined })
  })

  it('PATCHes /api/v1/books/{id}/ with only the supplied fields', async () => {
    client.patch.mockResolvedValue({ data: book })
    await updateBook(ID, { name: 'New', end_date: null })
    expect(client.patch).toHaveBeenCalledWith(`/api/v1/books/${ID}/`, { name: 'New', end_date: null })
  })

  it('POSTs to /archive/', async () => {
    client.post.mockResolvedValue({ data: { ...book, is_archived: true } })
    await archiveBook(ID)
    expect(client.post).toHaveBeenCalledWith(`/api/v1/books/${ID}/archive/`)
  })

  it('POSTs to /restore/ (the contract name for un-archiving)', async () => {
    client.post.mockResolvedValue({ data: { ...book, is_archived: false } })
    await restoreBook(ID)
    expect(client.post).toHaveBeenCalledWith(`/api/v1/books/${ID}/restore/`)
  })

  it('propagates not_found errors from the server', async () => {
    const err = { error: { code: 'not_found', message: 'Not found.' } }
    client.get.mockRejectedValue(err)
    await expect(getBook(ID)).rejects.toBe(err)
  })

  it('encodes unsafe id characters', async () => {
    client.get.mockResolvedValue({ data: book })
    await getBook('a/b')
    expect(client.get).toHaveBeenCalledWith('/api/v1/books/a%2Fb/', { signal: undefined })
  })
})

describe('service surface', () => {
  it('exposes no delete or unsupported operations', () => {
    expect(Object.keys(booksModule).sort()).toEqual(
      [
        'archiveBook',
        'createBook',
        'ensureMonthlyBook',
        'getBook',
        'listBooks',
        'restoreBook',
        'updateBook',
      ].sort(),
    )
    expect(client.delete).not.toHaveBeenCalled()
  })
})

describe('error helpers', () => {
  it('returns the API message for ordinary errors', () => {
    expect(getApiErrorMessage({ error: { code: 'validation_error', message: 'Bad.' } }, 'fb')).toBe('Bad.')
  })

  it('returns a friendly offline message for network errors', () => {
    expect(getApiErrorMessage({ error: { code: 'network_error', message: 'Network Error' } }, 'fb')).toBe(
      NETWORK_ERROR_MESSAGE,
    )
  })

  it('does not leak raw server_error text', () => {
    expect(getApiErrorMessage({ error: { code: 'server_error', message: 'Request failed 500' } }, 'fb')).toBe('fb')
  })

  it('falls back for non-ApiError values', () => {
    expect(getApiErrorMessage(new Error('boom'), 'fb')).toBe('fb')
    expect(getApiErrorCode(null)).toBeUndefined()
  })
})
