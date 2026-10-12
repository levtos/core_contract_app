import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

// The app is served as static files below an arbitrary Home Assistant Ingress
// prefix, so every URL stays relative ("./"). The server's CSP is
// `default-src 'self'`: assets must never be inlined as data: URIs.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.ts'],
    css: false,
    restoreMocks: true,
  },
});
