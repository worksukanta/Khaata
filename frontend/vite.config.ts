import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // Proxy API calls to the Django backend during development
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Forward cookies (needed for session + CSRF)
        cookieDomainRewrite: 'localhost',
      },
    },
  },
  build: {
    // Produce source maps in production for easier debugging
    sourcemap: true,
    outDir: 'dist',
  },
})
