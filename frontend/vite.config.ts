import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Nothing may be emitted at the root, where the server's slug route matches every segment.
  publicDir: false,
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  // Page work runs against `sbt run` on 8080; one origin, so the session cookie comes back.
  server: {
    proxy: { '/rooms': 'http://localhost:8080', '/create-room': 'http://localhost:8080' }
  },
  test: { include: ['src/**/*.test.ts'] }
})
