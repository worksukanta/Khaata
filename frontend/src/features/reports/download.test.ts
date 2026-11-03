import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadBlob } from './download'

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('downloadBlob', () => {
  it('hands the blob to the browser via a temporary anchor and cleans up', () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:khaata-test')
    const revoke = vi.fn()
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('transactions.csv')
      expect(this.href).toBe('blob:khaata-test')
    })
    const blob = new Blob(['a,b\r\n'], { type: 'text/csv' })

    downloadBlob(blob, 'transactions.csv')

    expect(create).toHaveBeenCalledWith(blob)
    expect(click).toHaveBeenCalledTimes(1)
    expect(document.querySelector('a[download]')).toBeNull()
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(revoke).toHaveBeenCalledWith('blob:khaata-test')
    vi.useRealTimers()
  })
})
