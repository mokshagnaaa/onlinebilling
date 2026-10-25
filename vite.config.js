import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/d3-') || id.includes('node_modules/victory-vendor/')) return 'vendor-chart-core'
          if (id.includes('node_modules/recharts/')) return 'vendor-charts'
          if (id.includes('node_modules/lucide-react/')) return 'vendor-icons'
          if (id.includes('node_modules/jspdf/')) return 'vendor-pdf'
          if (id.includes('node_modules/@supabase/')) return 'vendor-supabase'
        },
      },
    },
  },
  test: { environment: 'node' },
})
