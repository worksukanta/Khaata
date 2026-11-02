/**
 * Modal — accessible dialog used for book forms and confirmations.
 *
 *  - role="dialog" aria-modal="true" labelled by its title.
 *  - Focus moves into the dialog on open (first [data-autofocus] element, else
 *    the first focusable) and returns to the previously focused element on close.
 *  - Tab / Shift+Tab are trapped inside the dialog.
 *  - Escape and backdrop click close it unless `busy` (a request is in flight).
 */

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalProps {
  title: string
  onClose: () => void
  busy?: boolean
  children: ReactNode
}

export default function Modal({ title, onClose, busy = false, children }: ModalProps) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const target =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>(FOCUSABLE)
    target?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      previous?.focus?.()
    }
  }, [])

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      if (!busy) onClose()
      return
    }
    if (e.key !== 'Tab') return
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!nodes || nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onKeyDown={handleKeyDown}>
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        data-testid="modal-backdrop"
        onClick={() => {
          if (!busy) onClose()
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative max-h-[90vh] w-full overflow-y-auto rounded-t-card bg-surface p-4 shadow-xl sm:max-w-lg sm:rounded-card sm:p-6"
      >
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-text-primary">
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}
