/**
 * Tests for the CSV export service: endpoint, query parameters, filename
 * handling and error propagation.  The CSV text is produced by the backend; the
 * service must pass it through untouched.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}))

import apiClient from '@/services/api/client'
import {
  DEFAULT_EXPORT_FILENAME,
  exportTransactionsCsv,
  parseContentDispositionFilename,
} from '@/services/api/exports'

const client = vi.mocked(apiClient)

const CSV = 'id,book_id,type\r\n1,2,EXPENSE\r\n'

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('exportTransactionsCsv', () => {
  it('GETs /api/v1/exports/transactions.csv with no params by default', async () => {
    client.get.mockResolvedValue({ data: CSV, headers: {} })

    await exportTransactionsCsv()

    expect(client.get).toHaveBeenCalledWith('/api/v1/exports/transactions.csv', {
      params: {},
      signal: undefined,
    })
  })

  it('sends only the supported, non-empty filters', async () => {
    client.get.mockResolvedValue({ data: CSV, headers: {} })

    await exportTransactionsCsv({
      book_id: 'b1',
      type: 'EXPENSE',
      category_id: 'c1',
      payment_method_id: 'p1',
      date_from: '2026-10-01',
      date_to: '2026-10-31',
      search: '  lunch  ',
    })

    expect(client.get).toHaveBeenCalledWith('/api/v1/exports/transactions.csv', {
      params: {
        book_id: 'b1',
        type: 'EXPENSE',
        category_id: 'c1',
        payment_method_id: 'p1',
        date_from: '2026-10-01',
        date_to: '2026-10-31',
        search: 'lunch',
      },
      signal: undefined,
    })
  })

  it('never sends ordering or page (not supported by the export)', async () => {
    client.get.mockResolvedValue({ data: CSV, headers: {} })

    // The type forbids these; cast to prove the runtime also leaves them to the list only.
    await exportTransactionsCsv({ search: 'x' } as never)

    const config = client.get.mock.calls[0][1] as { params: Record<string, unknown> }
    expect(config.params).not.toHaveProperty('ordering')
    expect(config.params).not.toHaveProperty('page')
  })

  it('omits empty-string filters', async () => {
    client.get.mockResolvedValue({ data: CSV, headers: {} })

    await exportTransactionsCsv({ search: '   ', category_id: '' })

    const config = client.get.mock.calls[0][1] as { params: Record<string, unknown> }
    expect(config.params).toEqual({})
  })

  it('returns the server CSV text unchanged as a text/csv blob', async () => {
    client.get.mockResolvedValue({
      data: CSV,
      headers: { 'content-disposition': 'attachment; filename="transactions.csv"' },
    })

    const result = await exportTransactionsCsv()

    expect(result.filename).toBe('transactions.csv')
    expect(result.blob.type).toBe('text/csv;charset=utf-8')
    expect(await readBlob(result.blob)).toBe(CSV)
  })

  it('forwards the abort signal', async () => {
    client.get.mockResolvedValue({ data: CSV, headers: {} })
    const controller = new AbortController()

    await exportTransactionsCsv({}, controller.signal)

    expect(client.get).toHaveBeenCalledWith('/api/v1/exports/transactions.csv', {
      params: {},
      signal: controller.signal,
    })
  })

  it('rejects when the body is not CSV text (e.g. an unexpected JSON payload)', async () => {
    client.get.mockResolvedValue({ data: { unexpected: true }, headers: {} })

    await expect(exportTransactionsCsv()).rejects.toMatchObject({
      error: { code: 'server_error' },
    })
  })

  it('propagates API errors from the client interceptor', async () => {
    const error = { error: { code: 'validation_error', message: 'bad date' } }
    client.get.mockRejectedValue(error)

    await expect(exportTransactionsCsv({ date_from: 'x' })).rejects.toBe(error)
  })
})

describe('parseContentDispositionFilename', () => {
  it('reads a quoted filename', () => {
    expect(parseContentDispositionFilename('attachment; filename="report-2026.csv"')).toBe(
      'report-2026.csv',
    )
  })

  it('falls back to the default when the header is missing or not a string', () => {
    expect(parseContentDispositionFilename(undefined)).toBe(DEFAULT_EXPORT_FILENAME)
    expect(parseContentDispositionFilename(42)).toBe(DEFAULT_EXPORT_FILENAME)
  })

  it('falls back to the default for unsafe or non-csv names', () => {
    expect(parseContentDispositionFilename('attachment; filename="../../evil.csv"')).toBe(
      DEFAULT_EXPORT_FILENAME,
    )
    expect(parseContentDispositionFilename('attachment; filename="run.exe"')).toBe(
      DEFAULT_EXPORT_FILENAME,
    )
    expect(parseContentDispositionFilename('attachment')).toBe(DEFAULT_EXPORT_FILENAME)
  })
})
