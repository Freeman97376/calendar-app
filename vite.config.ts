import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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
})
