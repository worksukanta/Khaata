/**
 * Application entry point.
 *
 * Bootstrap sequence:
 * 1. Import global Tailwind styles.
 * 2. Mount the React application with all providers.
 *
 * The CSRF cookie is bootstrapped inside the AppProviders tree when an
 * authenticated route first loads (FE-002 will add an AuthProvider that
 * calls bootstrapCsrf() on startup).
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './assets/index.css'
import AppProviders from './app/providers'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found in index.html')
}

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders />
  </StrictMode>,
)
