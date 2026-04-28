import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Important for Electron `file://.../dist/index.html` loads:
  // ensures built assets are referenced relatively (./assets/...) instead of /assets/...
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist'
  }
});

