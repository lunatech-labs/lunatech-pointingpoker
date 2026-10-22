import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { normalizePath } from 'vite'
import { defineConfig } from 'vitest/config'

const modules = normalizePath(fileURLToPath(new URL('../node_modules/', import.meta.url)))
const licences = {
  'inter-OFL.txt': '../node_modules/@fontsource-variable/inter/LICENSE',
  'jetbrains-mono-OFL.txt': '../node_modules/@fontsource/jetbrains-mono/LICENSE'
}

export default defineConfig({
  // Nothing may be emitted at the root, where the server's slug route matches every segment.
  publicDir: false,
  plugins: [
    react(),
    // Ships each font's licence beside its files, under the names fonts.css's comment gives.
    {
      name: 'font-licences',
      generateBundle() {
        for (const [name, path] of Object.entries(licences)) {
          const source = readFileSync(new URL(path, import.meta.url))
          this.emitFile({ type: 'asset', fileName: `assets/${name}`, source })
        }
      },
      // Vite's dev server does not rewrite a preload href; pre, before it resolves one per page path.
      transformIndexHtml: {
        order: 'pre',
        handler(html, ctx) {
          if (!ctx.server) return html
          const fs = modules.startsWith('/') ? modules : `/${modules}`
          return html.replaceAll('href="../node_modules/', `href="/@fs${fs}`)
        }
      }
    }
  ],
  build: { outDir: 'dist', emptyOutDir: true },
  // Page work runs against `sbt run` on 8080; one origin, so the session cookie comes back.
  server: {
    proxy: { '/rooms': 'http://localhost:8080', '/create-room': 'http://localhost:8080' }
  },
  test: { include: ['src/**/*.test.ts'] }
})
