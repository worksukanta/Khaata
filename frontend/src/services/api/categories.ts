/**
 * Categories service — API client functions for Categories (API_CONTRACT.md §4).
 *
 * Endpoints:
 *   GET /api/v1/categories/   listCategories
 */

import apiClient from './client'
import type { Category, CategoryListParams, PaginatedResponse } from '@/types'

const CATEGORIES = '/api/v1/categories'

/** List categories for the authenticated user (paginated). */
export async function listCategories(
  params: CategoryListParams = {},
  signal?: AbortSignal,
): Promise<PaginatedResponse<Category>> {
  const query: Record<string, string | number | boolean> = {}
  if (params.type) query.type = params.type
  if (params.is_active !== undefined) query.is_active = params.is_active
  const search = params.search?.trim()
  if (search) query.search = search
  if (params.page !== undefined) query.page = params.page

  const response = await apiClient.get<PaginatedResponse<Category>>(`${CATEGORIES}/`, {
    params: query,
    signal,
  })
  return response.data
}
