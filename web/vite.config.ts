import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // React, Redux and the router are one ~160 kB (gzip) bundle; fine for this app.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
    globals: true,
  },
});
