/**
 * KpiCard — one headline figure (DESIGN_SYSTEM.md: KPIStatCard).
 * The value is a server-provided decimal string rendered verbatim (no arithmetic).
 */

import type { ReactNode } from 'react'

interface KpiCardProps {
  label: string
  value: string
  /** Extra textual qualifier, e.g. "Deficit" — meaning is never conveyed by colour alone. */
  note?: ReactNode
  tone?: 'default' | 'negative'
  testId?: string
}

export default function KpiCard({ label, value, note, tone = 'default', testId }: KpiCardProps) {
  return (
    <div
      className="min-w-0 rounded-card border border-border bg-surface p-4"
      data-testid={testId}
    >
      <p className="text-caption font-medium text-text-secondary">{label}</p>
      <p
        className={`mt-1 break-words text-kpi-sm font-bold tabular-nums ${
          tone === 'negative' ? 'text-danger-text' : 'text-text-primary'
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-caption text-text-secondary">{note}</p>}
    </div>
  )
}
