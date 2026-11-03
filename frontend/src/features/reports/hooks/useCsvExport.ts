/**
 * Mutation wrapper for GET /exports/transactions.csv.  A mutation (not a query)
 * because it is an explicit user action that must never be cached, retried
 * automatically or refetched on focus.  The CSV is produced by the backend; on
 * success the returned file is handed to the browser.
 */

import { useMutation } from '@tanstack/react-query'
import { exportTransactionsCsv } from '@/services/api/exports'
import type { TransactionExportParams } from '@/types'
import { downloadBlob } from '../download'

export function useCsvExport() {
  return useMutation({
    mutationFn: async (params: TransactionExportParams) => {
      const { blob, filename } = await exportTransactionsCsv(params)
      downloadBlob(blob, filename)
      return filename
    },
  })
}
