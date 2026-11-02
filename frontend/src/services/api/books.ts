/**
 * Books service — thin wrappers around the Books API (API_CONTRACT.md §3).
 *
 * Endpoints:
 *   GET    /books/                                  listBooks
 *   POST   /books/                                  createBook (EVENT | GENERAL only)
 *   POST   /books/monthly/{year}/{month}/ensure/    ensureMonthlyBook
 *   GET    /books/{id}/                             getBook
 *   PATCH  /books/{id}/                             updateBook
 *   POST   /books/{id}/archive/                     archiveBook
 *   POST   /books/{id}/restore/                     restoreBook
 *
 * The contract and backend name the un-archive action `restore`; there is no
 * `unarchive` route.  No delete operation exists.
 */

import apiClient from './client'
import type {
  Book,
  BookListParams,
  CreateBookPayload,
  EnsureMonthlyBookResult,
  PaginatedResponse,
  UpdateBookPayload,
} from '@/types'

const BOOKS = '/api/v1/books'

function bookPath(id: string): string {
  return `${BOOKS}/${encodeURIComponent(id)}`
}

/** List the authenticated user's books (paginated). Only supplied filters are sent. */
export async function listBooks(
  params: BookListParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Book>> {
  const query: Record<string, string | number | boolean> = {}
  if (params.type) query.type = params.type
  const search = params.search?.trim()
  if (search) query.search = search
  if (params.is_archived !== undefined) query.is_archived = params.is_archived
  if (params.ordering) query.ordering = params.ordering
  if (params.page !== undefined) query.page = params.page

  const response = await apiClient.get<PaginatedResponse<Book>>(`${BOOKS}/`, {
    params: query,
    signal,
  })
  return response.data
}

/** Create an EVENT or GENERAL book.  Monthly books use ensureMonthlyBook. */
export async function createBook(payload: CreateBookPayload): Promise<Book> {
  const response = await apiClient.post<Book>(`${BOOKS}/`, payload)
  return response.data
}

/**
 * Idempotently create-or-fetch the monthly book for a calendar month.
 * HTTP 201 → created, HTTP 200 → already existed.
 *
 * No AbortSignal is accepted on purpose: the call is a state-ensuring POST and
 * aborting it client-side (e.g. React StrictMode remount) would only cause a
 * duplicate request without cancelling the server-side effect.
 */
export async function ensureMonthlyBook(
  year: number,
  month: number,
): Promise<EnsureMonthlyBookResult> {
  const response = await apiClient.post<Book>(
    `${BOOKS}/monthly/${year}/${month}/ensure/`,
  )
  return { book: response.data, created: response.status === 201 }
}

/** Retrieve one owned book. */
export async function getBook(id: string, signal?: AbortSignal): Promise<Book> {
  const response = await apiClient.get<Book>(`${bookPath(id)}/`, { signal })
  return response.data
}

/** Update editable metadata of an active EVENT or GENERAL book. */
export async function updateBook(
  id: string,
  payload: UpdateBookPayload,
): Promise<Book> {
  const response = await apiClient.patch<Book>(`${bookPath(id)}/`, payload)
  return response.data
}

/** Archive an EVENT or GENERAL book. */
export async function archiveBook(id: string): Promise<Book> {
  const response = await apiClient.post<Book>(`${bookPath(id)}/archive/`)
  return response.data
}

/** Restore (un-archive) an archived EVENT or GENERAL book. */
export async function restoreBook(id: string): Promise<Book> {
  const response = await apiClient.post<Book>(`${bookPath(id)}/restore/`)
  return response.data
}
