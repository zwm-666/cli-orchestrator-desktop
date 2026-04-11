import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  root: path.resolve(rootDir, 'src/renderer'),
  base: './',
  build: {
    outDir: path.resolve(rootDir, 'dist/renderer'),
    emptyOutDir: true
  },
  resolve: {
    alias: {
      '@shared': path.resolve(rootDir, 'src/shared')
    }
  },
  server: {
    port: 5173,
    strictPort: true
  },
  test: {
    environment: 'happy-dom',
    root: rootDir,
    include: ['src/renderer/**/*.test.{ts,tsx}']
  }
});
