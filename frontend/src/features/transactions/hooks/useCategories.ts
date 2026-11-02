/**
 * TanStack Query hooks for Categories.
 */

import { useQuery } from '@tanstack/react-query'
import { listCategories } from '@/services/api/categories'
import type { CategoryListParams } from '@/types'

export const categoryKeys = {
  all: ['categories'] as const,
  lists: () => ['categories', 'list'] as const,
  list: (params: CategoryListParams) => ['categories', 'list', params] as const,
}

export function useCategoriesList(params: CategoryListParams = {}) {
  return useQuery({
    queryKey: categoryKeys.list(params),
    queryFn: ({ signal }) => listCategories(params, signal),
    staleTime: 5 * 60 * 1000,
  })
}
