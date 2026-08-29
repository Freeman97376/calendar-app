import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const apiPort = process.env.CALENDAR_E2E_API_PORT || '8787'
const apiUrl = `http://127.0.0.1:${apiPort}`

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/firebase')) return 'firebase'
          if (id.includes('node_modules/@dnd-kit')) return 'drag-drop'
          if (id.includes('node_modules')) return 'vendor'
          return undefined
        },
      },
    },
  },
  plugins: [react()],
  server: {
    watch: {
      ignored: ['**/src-tauri/target/**'],
    },
    proxy: {
      '/api': {
        target: apiUrl,
      },
    },
  },
})
