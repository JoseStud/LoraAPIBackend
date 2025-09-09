import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
    // Where Vite will look for your source files
    root: './app/frontend/static/',

    // Configuration for the development server
    server: {
        port: 5173,
        host: 'localhost',
        // Proxy API requests to the FastAPI backend
        proxy: {
            '/api': 'http://localhost:8000',
            '/ws': {
                target: 'ws://localhost:8000',
                ws: true,
            },
        },
    },

    // Configuration for the build process
    build: {
        // Where Vite will put the built files
        outDir: '../../../dist/static',

        // Generates a manifest.json file, which is key for backend integration
        manifest: true,

        // Clears the output directory on each build
        emptyOutDir: true,

        // Adjusts asset paths for backend rendering
        rollupOptions: {
            input: {
                // This is your main JS entry point
                main: './app/frontend/static/js/main.js'
            }
        }
    },

    // CSS processing configuration
    css: {
        devSourcemap: true,
    },

    // Optimize dependencies for development
    optimizeDeps: {
        include: ['alpinejs']
    }
});
