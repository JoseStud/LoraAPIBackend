import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const frontendSrc = resolve(__dirname, 'app/frontend/src');
const vendorDir = resolve(frontendSrc, 'vendor');

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: '@/composables/generation',
        replacement: resolve(frontendSrc, 'features/generation/composables'),
      },
      {
        find: '@/stores/generation',
        replacement: resolve(frontendSrc, 'features/generation/stores/form.ts'),
      },
      {
        find: '@',
        replacement: frontendSrc,
      },
      {
        find: 'vue-virtual-scroller',
        replacement: resolve(vendorDir, 'vue-virtual-scroller.ts'),
      },
      {
        find: 'vue-virtual-scroller/dist/vue-virtual-scroller.css',
        replacement: resolve(vendorDir, 'vue-virtual-scroller.css'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup/vitest.setup.js'],
    include: [
      'tests/vue/**/*.spec.{js,ts}',
      'tests/integration/**/*.test.js',
    ],
    css: false,
  },
});

