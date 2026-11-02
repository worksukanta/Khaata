/**
 * MonthNavigator — previous / next month controls with the selected
 * month and year displayed (DESIGN_SYSTEM.md: MonthPicker).
 *
 * December → January and January → December roll the year (see `shiftMonth`).
 * Navigation is limited to the years accepted by the ensure endpoint.
 */

import { secondaryButton } from '@/components/ui/styles'
import type { YearMonth } from '../types'
import { isWithinSupportedRange, monthLabel, shiftMonth } from '../utils'

interface MonthNavigatorProps {
  value: YearMonth
  current: YearMonth
  onChange: (next: YearMonth) => void
}

export default function MonthNavigator({ value, current, onChange }: MonthNavigatorProps) {
  const prev = shiftMonth(value, -1)
  const next = shiftMonth(value, 1)
  const isCurrent = value.year === current.year && value.month === current.month

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Select month">
      <button
        type="button"
        className={`${secondaryButton} min-w-touch`}
        aria-label="Previous month"
        disabled={!isWithinSupportedRange(prev)}
        onClick={() => onChange(prev)}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <p
        aria-live="polite"
        className="min-w-[10rem] flex-1 text-center text-lg font-semibold text-text-primary sm:flex-none"
        data-testid="selected-month"
      >
        {monthLabel(value)}
      </p>
      <button
        type="button"
        className={`${secondaryButton} min-w-touch`}
        aria-label="Next month"
        disabled={!isWithinSupportedRange(next)}
        onClick={() => onChange(next)}
      >
        <span aria-hidden="true">›</span>
      </button>
      {!isCurrent && (
        <button type="button" className={secondaryButton} onClick={() => onChange(current)}>
          Current month
        </button>
      )}
    </div>
  )
}
