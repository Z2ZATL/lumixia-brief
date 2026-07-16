import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

function clientBoundary(): Plugin {
  return {
    name: 'lumixia-client-boundary',
    generateBundle(_options, bundle) {
      const forbidden = Object.values(bundle)
        .filter((output) => output.type === 'chunk')
        .flatMap((chunk) => Object.keys(chunk.modules))
        .filter((moduleId) => {
          const normalized = moduleId.replaceAll('\\', '/');
          return normalized.includes('/server/') || normalized.includes('/node_modules/zod/');
        });
      if (forbidden.length) {
        throw new Error(
          `Server or Zod modules crossed the client boundary: ${forbidden.join(', ')}`,
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), clientBoundary()],
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
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'supabase',
              test: /node_modules[\\/]@supabase[\\/]/,
              priority: 20,
            },
            {
              name: 'react',
              test: /node_modules[\\/](?:react|react-dom|react-router)[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
}));
