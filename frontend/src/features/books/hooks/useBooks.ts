/**
 * TanStack Query hooks for the Books feature.
 *
 * Query keys:
 *   ['books', 'list', params]          paginated lists (active / archived separate via params)
 *   ['books', 'detail', id]            single book
 *   ['book-ensure', year, month]       monthly ensure (deliberately outside the 'books'
 *                                      prefix so list/detail invalidation never re-POSTs)
 *
 * Mutations invalidate only ['books', 'list'] and write the returned book into
 * its detail cache entry, so details are never stale after an edit.
 */

import { useEffect, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  archiveBook,
  createBook,
  ensureMonthlyBook,
  getBook,
  listBooks,
  restoreBook,
  updateBook,
} from '@/services/api/books'
import type { Book, BookListParams, CreateBookPayload, UpdateBookPayload } from '@/types'

export const bookKeys = {
  all: ['books'] as const,
  lists: () => ['books', 'list'] as const,
  list: (params: BookListParams) => ['books', 'list', params] as const,
  detail: (id: string) => ['books', 'detail', id] as const,
  ensure: (year: number, month: number) => ['book-ensure', year, month] as const,
}

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

export function useBooksList(params: BookListParams) {
  return useQuery({
    queryKey: bookKeys.list(params),
    queryFn: ({ signal }) => listBooks(params, signal),
    placeholderData: keepPreviousData,
  })
}

export function useBook(id: string | undefined) {
  return useQuery({
    queryKey: bookKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getBook(id as string, signal),
    enabled: Boolean(id),
  })
}

/**
 * Ensure the monthly book for a calendar month exists.
 *
 * Implemented as a query so that concurrent consumers and re-renders share a
 * single in-flight POST per month (query-key de-duplication) and the result is
 * cached for the session.  The endpoint is idempotent server-side.
 */
export function useEnsureMonthlyBook(year: number, month: number) {
  return useQuery({
    queryKey: bookKeys.ensure(year, month),
    queryFn: () => ensureMonthlyBook(year, month),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  })
}

function useCacheBook() {
  const queryClient = useQueryClient()
  return (book: Book) => {
    queryClient.setQueryData(bookKeys.detail(book.id), book)
    return queryClient.invalidateQueries({ queryKey: bookKeys.lists() })
  }
}

export function useCreateBook() {
  const cache = useCacheBook()
  return useMutation({
    mutationFn: (payload: CreateBookPayload) => createBook(payload),
    onSuccess: (book) => cache(book),
  })
}

export function useUpdateBook() {
  const cache = useCacheBook()
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateBookPayload }) =>
      updateBook(id, payload),
    onSuccess: (book) => cache(book),
  })
}

export function useArchiveBook() {
  const cache = useCacheBook()
  return useMutation({
    mutationFn: (id: string) => archiveBook(id),
    onSuccess: (book) => cache(book),
  })
}

export function useRestoreBook() {
  const cache = useCacheBook()
  return useMutation({
    mutationFn: (id: string) => restoreBook(id),
    onSuccess: (book) => cache(book),
  })
}
