/**
 * Helpers for working with the normalised ApiError shape produced by the
 * response interceptor in client.ts.
 */

import type { ApiError } from '@/types'

export const NETWORK_ERROR_MESSAGE =
  "You appear to be offline or the server can't be reached. Changes can't be saved right now."

export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false
  const inner = (value as { error: unknown }).error
  return typeof inner === 'object' && inner !== null
}

export function getApiErrorCode(value: unknown): string | undefined {
  return isApiError(value) ? value.error.code : undefined
}

/**
 * Return a safe, user-facing message.  Network failures and opaque server
 * errors never surface raw transport text.
 */
export function getApiErrorMessage(value: unknown, fallback: string): string {
  if (!isApiError(value)) return fallback
  const { code, message } = value.error
  if (code === 'network_error') return NETWORK_ERROR_MESSAGE
  if (code === 'server_error') return fallback
  return message || fallback
}
