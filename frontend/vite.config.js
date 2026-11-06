import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// React + Vite. Dev and preview servers fall back to index.html, so React Router paths survive a refresh.
export default defineConfig({
  plugins: [react()],
  // The date this version was built, shown as "Last updated" in the website footer.
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  // /api is forwarded to the Express API (server/, port 4000) so the session cookie stays same-site in development.
  server: { port: 5173, open: false, proxy: { '/api': 'http://localhost:4000' } },
  preview: { port: 4173, proxy: { '/api': 'http://localhost:4000' } },
  build: { outDir: 'dist', sourcemap: false }
});
