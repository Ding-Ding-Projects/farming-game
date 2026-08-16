import { defineConfig } from 'vite'

// The landing page is its own tiny Vite app. It imports the game's font and palette
// modules so the site and the game are set in the same type, but it never pulls in
// the game itself — nothing here is playable.
export default defineConfig({
  root: 'site',
  base: process.env.PAGES_BASE ?? '/',
  build: {
    outDir: '../dist-site',
    emptyOutDir: true,
    target: 'es2020',
  },
})
