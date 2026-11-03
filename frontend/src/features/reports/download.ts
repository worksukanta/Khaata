/**
 * Browser download helper.  Hands a Blob (already produced by the backend) to
 * the browser as a file; nothing is generated or transformed here.
 */

const REVOKE_DELAY_MS = 1000

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  // Revoke after the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}
