import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Forward /api to FastAPI so the browser sees one origin (no CORS setup needed).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
})
