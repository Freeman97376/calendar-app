import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    maxWorkers: 4,
    setupFiles: ['./Office/test/support/setupTests.ts'],
    include: [
      'Office/test/unit/**/*.{test,spec}.{ts,tsx}',
      'Office/test/integration/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['Office/test/e2e/**', 'node_modules/**', 'dist/**', 'scratch/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['Office/test/**', 'scratch/**', 'dist/**'],
    },
  },
})
