import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv, type Alias, type PluginOption } from 'vite';
import vue from '@vitejs/plugin-vue';

const frontendRoot = fileURLToPath(new URL('./app/frontend', import.meta.url));
const srcDirectory = fileURLToPath(new URL('./app/frontend/src', import.meta.url));
const entryFile = fileURLToPath(new URL('./app/frontend/src/main.ts', import.meta.url));

const createBundleInspectorPlugin = (): PluginOption => ({
  name: 'bundle-inspector',
  apply: 'build',
  generateBundle(_options, bundle) {
    const summary: Record<string, unknown> = {};

    for (const [fileName, output] of Object.entries(bundle)) {
      if (output.type !== 'chunk') {
        continue;
      }

      summary[fileName] = {
        facadeModuleId: output.facadeModuleId,
        isEntry: output.isEntry ?? false,
        codeSize: Buffer.byteLength(output.code, 'utf8'),
        imports: output.imports,
        dynamicImports: output.dynamicImports,
        modules: Object.keys(output.modules),
      } satisfies Record<string, unknown>;
    }

    this.emitFile({
      type: 'asset',
      fileName: 'bundle-inspector.json',
      source: JSON.stringify(summary, null, 2),
    });
  },
});

const pickFirst = (
  ...values: Array<string | undefined>
): string | undefined => values.find((value) => typeof value === 'string' && value.trim().length > 0);

const deriveProtocol = (value: string): string => {
  const match = value.match(/^([a-z]+):\/\//i);
  return match?.[1] ?? 'http';
};

const ensureProtocol = (value: string, fallbackProtocol: string): string => {
  if (/^[a-z]+:\/\//i.test(value)) {
    return value;
  }

  const normalised = value.replace(/^\/+/, '');
  return `${fallbackProtocol}://${normalised}`;
};

const normaliseTarget = (
  rawValue: string | undefined,
  fallback: string,
): string => {
  if (typeof rawValue !== 'string') {
    return fallback;
  }

  const trimmed = rawValue.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const url = new URL(trimmed);
    if (!url.host) {
      const protocol = deriveProtocol(fallback);
      return ensureProtocol(trimmed, protocol);
    }
    return `${url.protocol}//${url.host}`;
  } catch {
    const protocol = deriveProtocol(fallback);
    return ensureProtocol(trimmed, protocol);
  }
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, frontendRoot, '');

  const backendEnvCandidate = pickFirst(
    env.BACKEND_URL,
    env.VITE_BACKEND_URL,
    process.env.BACKEND_URL,
    process.env.VITE_BACKEND_URL,
  );

  const websocketEnvCandidate = pickFirst(
    env.WEBSOCKET_URL,
    env.VITE_WEBSOCKET_URL,
    process.env.WEBSOCKET_URL,
    process.env.VITE_WEBSOCKET_URL,
  );

  const backendTarget = normaliseTarget(
    backendEnvCandidate,
    'http://localhost:8000',
  );

  const websocketFallback = backendTarget.replace(/^http/i, 'ws');
  const websocketTargetCandidate = normaliseTarget(
    websocketEnvCandidate,
    websocketFallback,
  );
  const websocketTarget = /^https?:\/\//i.test(websocketTargetCandidate)
    ? websocketTargetCandidate.replace(/^http/i, 'ws')
    : websocketTargetCandidate;

  const alias: Alias[] = [
    {
      find: '@/features/generation/orchestrator',
      replacement: fileURLToPath(
        new URL('./app/frontend/src/features/generation/orchestrator/facade.ts', import.meta.url),
      ),
    },
    {
      find: '@/features',
      replacement: fileURLToPath(new URL('./app/frontend/src/features', import.meta.url)),
    },
    {
      find: '@',
      replacement: srcDirectory,
    },
  ];

  if (mode === 'test') {
    alias.unshift(
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
    );
  }

  const plugins: PluginOption[] = [vue()];

  if (process.env.VITE_ENABLE_BUNDLE_REPORT === '1') {
    plugins.push(createBundleInspectorPlugin());
  }

  return {
    plugins,
    root: './app/frontend',
    server: {
      port: 5173,
      host: 'localhost',
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          ws: true
        },
        '/ws': {
          target: websocketTarget,
          ws: true
        }
      }
    },
    resolve: {
      alias,
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
