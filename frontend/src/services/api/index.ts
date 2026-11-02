/**
 * Re-export all API services from a single entry point.
 * Components import from `@/services/api` rather than individual files.
 */
export { default as apiClient } from './client'
export * from './auth'
export * from './books'
export * from './categories'
export * from './paymentMethods'
export * from './transactions'
export * from './errors'
