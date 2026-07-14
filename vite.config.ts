import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    sourcemap:
      mode !== 'production' &&
      process.env['APP_ENV'] !== 'production' &&
      process.env['VERCEL_ENV'] !== 'production',
  },
}));
