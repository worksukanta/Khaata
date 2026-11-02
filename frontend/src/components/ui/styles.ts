/**
 * Shared Tailwind class strings for buttons and inputs, aligned with the
 * existing LoginPage conventions (44px touch targets, brand-700 focus ring).
 */

const base =
  'inline-flex min-h-touch items-center justify-center rounded-input px-4 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

export const primaryButton = `${base} bg-brand-700 text-white hover:bg-brand-600`
export const secondaryButton = `${base} border border-border bg-surface text-text-primary hover:bg-gray-100`
export const dangerButton = `${base} bg-danger-text text-white hover:opacity-90`

export const inputClass =
  'block w-full min-h-touch rounded-input border border-border bg-surface px-3 py-2 text-body text-text-primary placeholder-text-secondary focus:border-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-700 disabled:cursor-not-allowed disabled:opacity-50'
