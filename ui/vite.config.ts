import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const sharedUi = fileURLToPath(new URL('./src/reiq-ui', import.meta.url))

// The UI talks to the FastAPI service through /api. In dev, Vite forwards it to port 8000.
// `@reiq/ui` is the REIQ shared UI package, copied into src/reiq-ui (see src/reiq-ui/README).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@reiq/ui': sharedUi },
    dedupe: ['react', 'react-dom', 'react-router-dom', '@carbon/react', '@carbon/icons-react', 'axios'],
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } },
  },
})
