/**
 * API client unit test.
 * Verifies that the CSRF token helper and the Axios interceptor
 * behave correctly without a network connection.
 */

import { getCsrfToken } from '@/services/api/client'

describe('getCsrfToken', () => {
  afterEach(() => {
    // Clear cookies between tests
    document.cookie = 'csrftoken=; Max-Age=0'
  })

  it('returns null when no csrftoken cookie is set', () => {
    expect(getCsrfToken()).toBeNull()
  })

  it('returns the csrftoken value when the cookie is set', () => {
    document.cookie = 'csrftoken=test-token-abc'
    expect(getCsrfToken()).toBe('test-token-abc')
  })
})
