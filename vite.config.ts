import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

const frontendRoot = fileURLToPath(new URL('./app/frontend', import.meta.url));
const srcDirectory = fileURLToPath(new URL('./app/frontend/src', import.meta.url));
const entryFile = fileURLToPath(new URL('./app/frontend/src/main.ts', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendRoot, '');

  return {
    plugins: [vue()],
    root: './app/frontend',
    server: {
      port: 5173,
      host: 'localhost',
      proxy: {
        '/api': {
          target: env.BACKEND_URL || 'http://localhost:8000',
          changeOrigin: true,
          ws: true
        },
        '/ws': {
          target: env.WEBSOCKET_URL || 'ws://localhost:8000',
          ws: true
        }
      }
    },
    resolve: {
      alias: [
        // CSS must come first to avoid path appending on the TS alias
        {
          find: /^vue-virtual-scroller\/dist\/vue-virtual-scroller\.css$/,
          replacement: fileURLToPath(
            new URL('./app/frontend/src/vendor/vue-virtual-scroller.css', import.meta.url),
          ),
        },
        {
          find: /^vue-virtual-scroller$/,
          replacement: fileURLToPath(
            new URL('./app/frontend/src/vendor/vue-virtual-scroller.ts', import.meta.url),
          ),
        },
        {
          find: '@',
          replacement: srcDirectory,
        },
      ],
    },
    build: {
      outDir: '../dist',
      manifest: true,
      emptyOutDir: true,
      rollupOptions: {
        input: entryFile
      }
    },
    css: {
      devSourcemap: true
    },
    optimizeDeps: {
      include: ['chart.js/auto', 'pinia', 'vue']
    }
  };
});
