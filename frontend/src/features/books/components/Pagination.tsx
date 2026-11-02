/** Previous / Next pagination controls for page-number paginated lists. */

import { secondaryButton } from '@/components/ui/styles'

interface PaginationProps {
  page: number
  hasPrevious: boolean
  hasNext: boolean
  onPageChange: (page: number) => void
}

export default function Pagination({ page, hasPrevious, hasNext, onPageChange }: PaginationProps) {
  if (!hasPrevious && !hasNext) return null
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-3">
      <button
        type="button"
        className={secondaryButton}
        disabled={!hasPrevious}
        onClick={() => onPageChange(page - 1)}
      >
        Previous page
      </button>
      <span className="text-sm text-text-secondary">Page {page}</span>
      <button
        type="button"
        className={secondaryButton}
        disabled={!hasNext}
        onClick={() => onPageChange(page + 1)}
      >
        Next page
      </button>
    </nav>
  )
}
