import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React + Vite. Dev and preview servers fall back to index.html, so React Router paths survive a refresh.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
  preview: { port: 4173 },
  build: { outDir: 'dist', sourcemap: false }
});
