import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Ledger Odyssey ships as a GitHub Pages project site when published, so
// assets may live under a /<repo>/ subpath. The deploy workflow derives the
// value from the repository name and passes it in as VITE_BASE, so the base
// path can never drift from the repo name (and stays correct if the repo is
// renamed, or if the site is ever published as a user/org page at the root).
// The default here is the local dev case: VITE_BASE=/ npm run dev.
const base = process.env.VITE_BASE ?? '/'

export default defineConfig({
  plugins: [react()],
  base,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
})
