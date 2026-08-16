import { defineConfig } from 'vitest/config'

export default defineConfig(({ command }) => ({
  // The desktop build loads dist/index.html straight off the filesystem, so a built
  // bundle needs relative asset paths. The GitHub Pages build is served from a
  // subpath, so CI sets PAGES_BASE. The dev server keeps the root.
  base: process.env.PAGES_BASE ?? (command === 'build' ? './' : '/'),
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}))
