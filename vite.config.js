import { resolve } from 'path';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
    // Load environment variables from .env files
    const env = loadEnv(mode, '.', '');
    
    return {
        plugins: [vue()],
        // Where Vite will look for your source files
        root: './app/frontend',

        // Configuration for the development server
        server: {
            port: 5173,
            host: 'localhost',
            // Proxy API requests to the FastAPI backend
            proxy: {
                '/api': env.BACKEND_URL || 'http://localhost:8000',
                '/ws': {
                    target: env.WEBSOCKET_URL || 'ws://localhost:8000',
                    ws: true,
                },
            },
        },

    // Configuration for the build process
    build: {
        // Where Vite will put the built files
        outDir: '../../dist/static',

        // Generates a manifest.json file, which is key for backend integration
        manifest: true,

        // Clears the output directory on each build
        emptyOutDir: true,

        rollupOptions: {
            input: {
                main: resolve(__dirname, 'app/frontend/src/main.ts')
            }
        }
    },

    resolve: {
        alias: {
            '@': resolve(__dirname, 'app/frontend/src')
        }
    },

        // CSS processing configuration
        css: {
            devSourcemap: true,
        },

        // Optimize dependencies for development
        optimizeDeps: {
            include: ['chart.js/auto', 'pinia', 'vue']
        }
    };
});
