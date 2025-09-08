/**
 * Component Loader Core Module
 * 
 * Handles the main initialization, lifecycle orchestration, and coordination
 * between stubs, real components, and Alpine.js registration.
 */

/**
 * Component Loader Core Class
 */
class ComponentLoaderCore {
    constructor() {
        this.components = {};
        this.stubs = {};
        this.loadedScripts = new Set();
        this.isAlpineReady = false;
        this.isInitialized = false;
        this.pendingRegistrations = new Map();
        this.dependencies = ['DevLogger'];
    }

    /**
     * Initialize the component loader
     */
    init() {
        if (this.isInitialized) {
            return;
        }

        this.isInitialized = true;

        if (window.DevLogger && window.DevLogger.debug) {
            window.DevLogger.debug('[ComponentLoader] Initializing core...');
        }

        // Set up logging first
        this.setupLogging();
        
        // Create comprehensive stubs
        this.createStubs();
        
        // Wait for dependencies before Alpine.js
        this.waitForDependencies();
        
        if (window.DevLogger && window.DevLogger.debug) {
            window.DevLogger.debug('[ComponentLoader] Core initialization complete');
        }
    }

    /**
     * Set up logging infrastructure
     */
    setupLogging() {
        if (typeof window.DevLogger === 'undefined') {
            // Create a basic logger if not available
            // Note: Console usage is intentional here for core logging setup
            /* eslint-disable no-console */
            window.DevLogger = {
                debug(...args) {
                    if (window.__DEV_CONSOLE__ && typeof console !== 'undefined' && console.log) {
                        console.log('[DEBUG]', ...args);
                    }
                },
                warn(...args) {
                    if (window.__DEV_CONSOLE__ && typeof console !== 'undefined' && console.warn) {
                        console.warn('[WARN]', ...args);
                    }
                },
                error(...args) {
                    if (window.__DEV_CONSOLE__ && typeof console !== 'undefined' && console.error) {
                        console.error('[ERROR]', ...args);
                    }
                }
            };
            /* eslint-enable no-console */
        }

        // Enable console by default
        if (typeof window.__DEV_CONSOLE__ === 'undefined') {
            window.__DEV_CONSOLE__ = true;
        }
    }

    /**
     * Wait for required dependencies to be available
     */
    waitForDependencies() {
        const checkDependencies = () => {
            const missing = this.dependencies.filter(dep => typeof window[dep] === 'undefined');
            
            if (missing.length === 0) {
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('[ComponentLoader] All dependencies available');
                }
                this.waitForAlpine();
            } else {
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug('[ComponentLoader] Waiting for dependencies:', missing);
                }
                setTimeout(checkDependencies, 50);
            }
        };
        
        checkDependencies();
    }

    /**
     * Wait for Alpine.js to be ready
     */
    waitForAlpine() {
        if (typeof window.Alpine !== 'undefined') {
            this.onAlpineReady();
        } else {
            if (window.DevLogger && window.DevLogger.debug) {
                window.DevLogger.debug('[ComponentLoader] Waiting for Alpine.js...');
            }
            
            document.addEventListener('alpine:init', () => {
                this.onAlpineReady();
            }, { once: true });
        }
    }

    /**
     * Called when Alpine.js is ready
     */
    onAlpineReady() {
        this.isAlpineReady = true;
        
        if (window.DevLogger && window.DevLogger.debug) {
            window.DevLogger.debug('[ComponentLoader] Alpine.js ready, registering stubs...');
        }

        // Register all stubs with Alpine
        this.registerStubs();
        
        // Process any pending registrations
        this.processPendingRegistrations();
        
        if (window.DevLogger && window.DevLogger.debug) {
            window.DevLogger.debug('[ComponentLoader] Component loader fully initialized');
        }
    }

    /**
     * Create component stubs
     */
    createStubs() {
        if (window.DevLogger && window.DevLogger.debug) {
            window.DevLogger.debug('[ComponentLoader] Creating component stubs...');
        }

        // Load stubs from the stubs module if available
        if (window.ComponentStubs && window.ComponentStubs.createAllStubs) {
            this.stubs = window.ComponentStubs.createAllStubs();
        } else {
            // Fallback to basic stubs
            this.createBasicStubs();
        }
    }

    /**
     * Create basic fallback stubs
     */
    createBasicStubs() {
        const componentNames = [
            'mobileNav', 'recommendationsData', 'generationStudio', 'generationHistory',
            'performanceAnalytics', 'importExport', 'loraGallery', 'promptComposer',
            'systemAdmin', 'offlinePage', 'promptRecommendations', 'loraCard',
            'dashboard', 'searchFilter', 'generationMonitor'
        ];

        componentNames.forEach(name => {
            this.stubs[name] = () => {
                const stub = window.getCommonStub ? window.getCommonStub(name) : { init() {} };
                return stub;
            };
        });
    }

    /**
     * Register all stubs with Alpine.js
     */
    registerStubs() {
        if (!this.isAlpineReady) {
            if (window.DevLogger && window.DevLogger.warn) {
                window.DevLogger.warn('[ComponentLoader] Cannot register stubs: Alpine not ready');
            }
            return;
        }

        Object.entries(this.stubs).forEach(([name, factory]) => {
            try {
                if (window.Alpine && window.Alpine.data) {
                    window.Alpine.data(name, factory);
                    if (window.DevLogger && window.DevLogger.debug) {
                        window.DevLogger.debug(`[ComponentLoader] Registered stub: ${name}`);
                    }
                }
            } catch (error) {
                if (window.DevLogger && window.DevLogger.error) {
                    window.DevLogger.error(`[ComponentLoader] Failed to register stub ${name}:`, error);
                }
            }
        });
    }

    /**
     * Register a real component (replacing stub)
     * @param {string} name - Component name
     * @param {Function} factory - Component factory function
     */
    registerComponent(name, factory) {
        if (!this.isAlpineReady) {
            // Store for later registration
            this.pendingRegistrations.set(name, factory);
            return;
        }

        try {
            this.components[name] = factory;
            
            // Make the factory available globally for lazy components
            window[name] = factory;
            
            // Re-register with Alpine to replace the stub
            if (window.Alpine && window.Alpine.data) {
                window.Alpine.data(name, factory);
                
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug(`[ComponentLoader] Registered real component: ${name}`);
                }
            }
        } catch (error) {
            if (window.DevLogger && window.DevLogger.error) {
                window.DevLogger.error(`[ComponentLoader] Failed to register component ${name}:`, error);
            }
        }
    }

    /**
     * Process pending registrations
     */
    processPendingRegistrations() {
        this.pendingRegistrations.forEach((factory, name) => {
            this.registerComponent(name, factory);
        });
        this.pendingRegistrations.clear();
    }

    /**
     * Check if a component is loaded
     * @param {string} name - Component name
     * @returns {boolean} True if component is loaded
     */
    isComponentLoaded(name) {
        return Object.prototype.hasOwnProperty.call(this.components, name);
    }

    /**
     * Get component factory
     * @param {string} name - Component name
     * @returns {Function|null} Component factory or null
     */
    getComponent(name) {
        return this.components[name] || null;
    }

    /**
     * Load component script dynamically
     * @param {string} scriptUrl - Script URL to load
     * @returns {Promise<void>} Promise that resolves when script is loaded
     */
    async loadScript(scriptUrl) {
        if (this.loadedScripts.has(scriptUrl)) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = scriptUrl;
            script.async = true;
            
            script.onload = () => {
                this.loadedScripts.add(scriptUrl);
                if (window.DevLogger && window.DevLogger.debug) {
                    window.DevLogger.debug(`[ComponentLoader] Loaded script: ${scriptUrl}`);
                }
                resolve();
            };
            
            script.onerror = (error) => {
                if (window.DevLogger && window.DevLogger.error) {
                    window.DevLogger.error(`[ComponentLoader] Failed to load script: ${scriptUrl}`, error);
                }
                reject(new Error(`Failed to load script: ${scriptUrl}`));
            };
            
            document.head.appendChild(script);
        });
    }

    /**
     * Load multiple scripts in sequence
     * @param {string[]} scriptUrls - Array of script URLs
     * @returns {Promise<void>} Promise that resolves when all scripts are loaded
     */
    async loadScripts(scriptUrls) {
        for (const url of scriptUrls) {
            await this.loadScript(url);
        }
    }

    /**
     * Get loader status for debugging
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            isInitialized: this.isInitialized,
            isAlpineReady: this.isAlpineReady,
            stubsCount: Object.keys(this.stubs).length,
            componentsCount: Object.keys(this.components).length,
            loadedScripts: Array.from(this.loadedScripts),
            pendingRegistrations: Array.from(this.pendingRegistrations.keys())
        };
    }

    /**
     * Reset the loader (useful for testing)
     */
    reset() {
        this.components = {};
        this.stubs = {};
        this.loadedScripts = new Set();
        this.isAlpineReady = false;
        this.isInitialized = false;
        this.pendingRegistrations = new Map();
    }
}

// Create singleton instance
const componentLoaderCore = new ComponentLoaderCore();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ComponentLoaderCore, componentLoaderCore };
} else if (typeof window !== 'undefined') {
    window.ComponentLoaderCore = ComponentLoaderCore;
    window.componentLoaderCore = componentLoaderCore;
}
