import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

const frontendSrc = resolve(__dirname, 'app/frontend/src');
const vendorDir = resolve(frontendSrc, 'vendor');

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': frontendSrc,
      'vue-virtual-scroller': resolve(vendorDir, 'vue-virtual-scroller.ts'),
      'vue-virtual-scroller/dist/vue-virtual-scroller.css': resolve(
        vendorDir,
        'vue-virtual-scroller.css',
      ),
    },
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

