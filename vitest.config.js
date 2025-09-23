import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'app/frontend/src'),
      'vue-virtual-scroller': resolve(
        __dirname,
        'tests/mocks/vueVirtualScrollerStub.ts'
      ),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/vitest.setup.js'],
    include: [
      'tests/unit/**/*.spec.{js,ts}',
      'tests/vue/**/*.spec.{js,ts}',
      'tests/integration/**/*.test.js',
    ],
    css: false,
  },
});

