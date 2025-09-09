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
            },
            // Suppress eval warnings for HTMX - this is safe as HTMX uses eval for template processing
            onwarn(warning, warn) {
                // Suppress eval warnings from HTMX
                if (warning.code === 'EVAL' && warning.id && warning.id.includes('htmx')) {
                    return;
                }
                warn(warning);
            }
        }
    },

    // Configure module resolution to use the standard HTMX build
    resolve: {
        alias: {
            'htmx.org': 'htmx.org/dist/htmx.min.js'
        }
    },

    // CSS processing configuration
    css: {
        devSourcemap: true,
    },

    // Optimize dependencies for development
    optimizeDeps: {
        include: ['alpinejs', 'htmx.org', 'chart.js/auto']
    }
});
