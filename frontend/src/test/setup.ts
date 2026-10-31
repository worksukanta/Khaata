/**
 * Vitest global test setup.
 * Imports jest-dom matchers so assertions like .toBeInTheDocument() work.
 * The vitest.d.ts import augments Vitest's Assertion interface with jest-dom matchers.
 */
import '@testing-library/jest-dom/vitest'
